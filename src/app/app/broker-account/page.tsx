import Link from "next/link";
import { Landmark } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import AutoRefresh from "@/components/live/auto-refresh";
import StatCard from "@/components/ui/stat-card";
import EmptyState from "@/components/empty-state";
import { brokerById } from "@/lib/brokers/catalog";
import { ACCOUNT_READERS } from "@/lib/brokers/account-data";
import { loadBrokerAccount, type Section } from "@/lib/brokers/account-load";
import { checkRateLimit } from "@/lib/rate-limit";
import { classifyOrder, classifyPosition, type Source } from "@/lib/live/classify";
import { formatINR, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";
import Pager from "@/components/ui/pager";
import ListToolbar, { type ToolbarSelect } from "@/components/ui/list-toolbar";
import { readPageQuery, type PageWindow } from "@/lib/pagination";
import { pageRows, qEnum, qText } from "@/lib/list-query";

export const metadata = { title: "Broker Account", robots: { index: false } };
export const dynamic = "force-dynamic";

const price = (v: number | null) => (v == null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const pnl = (v: number | null) => (v == null ? <span className="text-brand-navy/35">—</span> : <span className={TONE_TEXT[toneOf(v)]}>{formatSignedINR(v, 2)}</span>);

const SOURCE_STYLE: Record<Source, string> = {
  MAA: "bg-brand-primary/10 text-brand-primary",
  MANUAL: "bg-brand-navy/[0.06] text-brand-navy/65",
  MIXED: "bg-brand-gold/15 text-[#6f5a22]",
  UNKNOWN: "bg-brand-gold/15 text-[#6f5a22] ring-1 ring-brand-gold/30",
};
const SOURCE_HINT: Record<Source, string> = {
  MAA: "Sent by a MyAlgoAgent strategy — its broker order id is in our record of orders we sent.",
  MANUAL: "Not sent by MyAlgoAgent: we keep a complete record of what we send, and this isn't in it — so it was placed at your broker directly (or by another tool).",
  MIXED: "Part of this position comes from MyAlgoAgent orders and part does not.",
  UNKNOWN: "We have an order that never got a broker id (the broker's answer was lost) which could be this one, so we can't say.",
};
function SourcePill({ source, strategy }: { source: Source; strategy?: string | null }) {
  return (
    <span title={SOURCE_HINT[source]} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${SOURCE_STYLE[source]}`}>
      {source}
      {strategy ? <span className="ml-1 font-medium opacity-70">· {strategy}</span> : null}
    </span>
  );
}

/**
 * One table from the broker (holdings, positions, orders or trades): its own search, filters and
 * pages, kept in the URL under its own prefix so the other tables stay where they were. Only the
 * page shown is rendered — a 300-holding account doesn't send 300 rows to the browser.
 */
function Part({
  title,
  section,
  empty,
  total,
  shown,
  toolbar,
  pager,
  children,
}: {
  title: string;
  section: Section<unknown>;
  empty: string;
  total: number;
  shown: number;
  toolbar: React.ReactNode;
  pager: React.ReactNode;
  children: React.ReactNode;
}) {
  if (section === null) return null;
  return (
    <section className="surface overflow-hidden">
      <p className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">
        {title}
        {section.ok && total > 0 && <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-[11px] text-brand-navy/55">{total}</span>}
      </p>
      {!section.ok ? (
        <p className="px-4 py-5 text-sm text-brand-sell">{section.error}</p>
      ) : total === 0 ? (
        <p className="px-4 py-5 text-sm text-brand-navy/45">{empty}</p>
      ) : (
        <>
          <div className="border-b border-black/[0.04] px-4 py-2.5">{toolbar}</div>
          {shown === 0 ? <p className="px-4 py-5 text-sm text-brand-navy/45">Nothing matches.</p> : <div className="overflow-x-auto [contain:inline-size]">{children}</div>}
          <div className="px-4 pb-3">{pager}</div>
        </>
      )}
    </section>
  );
}

type Raw = string | string[] | undefined;
const SIDES: ToolbarSelect["options"] = [{ value: "all", label: "Buy & sell" }, { value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }];
const BY: ToolbarSelect["options"] = [{ value: "all", label: "Anyone" }, { value: "MAA", label: "MyAlgoAgent" }, { value: "MANUAL", label: "Manual" }];
/** Broker order statuses vary by broker; these groups match them by meaning. */
const ORDER_STATE: Record<string, RegExp> = { open: /open|pending|trigger|placed|new|ack|partial/i, done: /complete|fill|execut|traded/i, rejected: /reject|fail/i, cancelled: /cancel/i };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, Raw>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const now = new Date();
  const conns = await prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true }, orderBy: { createdAt: "asc" } });
  const usable = conns.filter((c) => c.status === "CONNECTED" && c.tokenExpiresAt && c.tokenExpiresAt > now && ACCOUNT_READERS[c.broker as keyof typeof ACCOUNT_READERS]);
  const sp = await searchParams;
  const asked = qText(sp.broker, 20);
  const broker = usable.find((c) => c.broker === asked)?.broker ?? usable[0]?.broker;

  const header = (
    <PageHeader
      title="Broker Account"
      icon={Landmark}
      description="Your real account as your broker reports it: funds, holdings, positions and today's orders and trades. Read-only — nothing here changes anything at your broker."
    />
  );
  if (!broker) {
    return (
      <div>
        {header}
        <EmptyState pose="idle" title="No broker connected for today." description="Connect a broker (or log in for today) to see your account here." ctaLabel="Broker Connections" ctaHref="/app/broker-connections" />
      </div>
    );
  }
  const limited = await checkRateLimit(`broker-account:${userId}`, 20, 60_000);
  const acct = limited ? { error: "Refreshing too often — wait a moment." } : await loadBrokerAccount(userId, broker);
  // Everything MyAlgoAgent ever sent to this broker: what lets us say which orders and positions are ours.
  const sent = await prisma.liveOrder.findMany({
    where: { userId, broker },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { brokerOrderId: true, tradingSymbol: true, side: true, quantity: true, filledQuantity: true, status: true, createdAt: true, deployment: { select: { strategyName: true } } },
  });
  const ours = sent.map((o) => ({ ...o, side: o.side as "BUY" | "SELL", strategyName: o.deployment?.strategyName ?? null }));

  // Each table's settings, under its own prefix: hold*, pos*, ord*, trd*.
  const KEYS = ["holdq", "holdpage", "holdsize", "posq", "posstate", "posby", "pospage", "possize", "ordq", "ordstate", "ordside", "ordby", "ordpage", "ordsize", "trdq", "trdside", "trdpage", "trdsize"];
  const params: Record<string, string | undefined> = { broker: asked, ...Object.fromEntries(KEYS.map((k) => [k, qText(sp[k], 40)])) };
  const pageOf = (p: string) => readPageQuery({ page: sp[`${p}page`], size: sp[`${p}size`] }, 10);
  const has = (q: string | undefined, ...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));
  const listOf = <T,>(sec: Section<T[]> | undefined): T[] => (sec?.ok ? sec.data : []);
  const toolbar = (p: string, placeholder: string, selects: ToolbarSelect[] = []) => (
    <ListToolbar basePath="/app/broker-account" params={params} pageKey={`${p}page`} search={{ name: `${p}q`, placeholder }} selects={selects} />
  );
  const pager = (p: string, win: PageWindow) => <Pager basePath="/app/broker-account" params={params} window={win} pageKey={`${p}page`} sizeKey={`${p}size`} />;

  const holdAll = "error" in acct ? [] : listOf(acct.holdings);
  const hold = pageRows(holdAll.filter((r) => has(params.holdq, r.symbol)), pageOf("hold").page, pageOf("hold").size);

  const posAll = "error" in acct ? [] : listOf(acct.positions).map((r) => ({ r, by: classifyPosition(r, ours, now) }));
  const posState = qEnum(params.posstate, ["all", "open", "closed"] as const, "all");
  const posBy = qEnum(params.posby, ["all", "MAA", "MANUAL"] as const, "all");
  const pos = pageRows(
    posAll.filter(({ r, by }) => has(params.posq, r.symbol, r.product) && (posState === "all" || (posState === "open" ? r.quantity !== 0 : r.quantity === 0)) && (posBy === "all" || by === posBy)),
    pageOf("pos").page,
    pageOf("pos").size,
  );

  const ordAll = "error" in acct ? [] : listOf(acct.orders).map((r) => ({ r, c: classifyOrder(r, ours) }));
  const ordState = qEnum(params.ordstate, ["all", "open", "done", "rejected", "cancelled"] as const, "all");
  const ordSide = qEnum(params.ordside, ["all", "BUY", "SELL"] as const, "all");
  const ordBy = qEnum(params.ordby, ["all", "MAA", "MANUAL"] as const, "all");
  const ord = pageRows(
    ordAll.filter(({ r, c }) => has(params.ordq, r.symbol, r.id, r.status) && (ordState === "all" || ORDER_STATE[ordState].test(r.status ?? "")) && (ordSide === "all" || r.side === ordSide) && (ordBy === "all" || c.source === ordBy)),
    pageOf("ord").page,
    pageOf("ord").size,
  );

  const trdAll = "error" in acct ? [] : listOf(acct.trades);
  const trdSide = qEnum(params.trdside, ["all", "BUY", "SELL"] as const, "all");
  const trd = pageRows(trdAll.filter((r) => has(params.trdq, r.symbol, r.id) && (trdSide === "all" || r.side === trdSide)), pageOf("trd").page, pageOf("trd").size);

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={10} />
      {header}
      {usable.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {usable.map((c) => (
            <Link
              key={c.broker}
              href={`/app/broker-account?broker=${c.broker}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${c.broker === broker ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/10"}`}
            >
              {brokerById(c.broker)?.name ?? c.broker}
            </Link>
          ))}
        </div>
      )}
      {"error" in acct ? (
        <p className="surface p-5 text-sm text-brand-sell">{acct.error}</p>
      ) : (
        <>
          {acct.profile?.ok && (
            <p className="text-sm text-brand-navy/70">
              {acct.name} · {acct.profile.data.name ?? "—"} {acct.profile.data.clientId && <span className="text-brand-navy/45">({acct.profile.data.clientId})</span>}
            </p>
          )}
          {acct.funds && (
            <div className="grid gap-3 sm:grid-cols-3">
              {acct.funds.ok ? (
                <>
                  <StatCard label="Available to trade" value={acct.funds.data.available == null ? "—" : formatINR(acct.funds.data.available)} />
                  <StatCard label="Margin used" value={acct.funds.data.used == null ? "—" : formatINR(acct.funds.data.used)} />
                  {acct.funds.data.total != null ? (
                    <StatCard label="Account value" value={formatINR(acct.funds.data.total)} />
                  ) : acct.funds.data.available != null && acct.funds.data.used != null ? (
                    <StatCard label="Account value (estimate)" value={formatINR(acct.funds.data.available + acct.funds.data.used)} sub="Your broker doesn't state a total; this is available + margin used" />
                  ) : (
                    <StatCard label="Account value" value="—" />
                  )}
                </>
              ) : (
                <p className="text-sm text-brand-sell sm:col-span-3">Funds: {acct.funds.error}</p>
              )}
            </div>
          )}
          {acct.funds?.ok && acct.funds.data.lines && acct.funds.data.lines.length > 0 && (
            <details className="surface px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold text-brand-navy">How these figures match {acct.name}</summary>
              <p className="mt-2 text-xs text-brand-navy/60">Every figure {acct.name} sent, under its own name. “Available to trade” is the broker&apos;s cash/margin-available figure and “Margin used” its margin-used figure; nothing is added or guessed except the labelled estimate.</p>
              <table className="data-table mt-2">
                <thead>
                  <tr>
                    <th>{acct.name} field</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {acct.funds.data.lines.map((l) => (
                    <tr key={l.name}>
                      <td className="font-mono text-xs">{l.name}</td>
                      <td>{formatINR(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <Part title="Holdings" section={acct.holdings} empty="No holdings." total={holdAll.length} shown={hold.rows.length} toolbar={toolbar("hold", "Search holdings…")} pager={pager("hold", hold.win)}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Qty</th>
                  <th>Avg price</th>
                  <th>Last price</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {hold.rows.map((r, i) => (
                  <tr key={`${r.symbol}-${i}`}>
                    <td className="font-semibold">{r.symbol}</td>
                    <td>{r.quantity}</td>
                    <td>{price(r.avgPrice)}</td>
                    <td>{price(r.ltp)}</td>
                    <td>{pnl(r.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>
          <Part
            title="Positions"
            section={acct.positions}
            empty="No open positions today."
            total={posAll.length}
            shown={pos.rows.length}
            toolbar={toolbar("pos", "Search positions…", [
              { name: "posstate", label: "Show", options: [{ value: "all", label: "Open & closed" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed today" }] },
              { name: "posby", label: "Placed by", options: BY },
            ])}
            pager={pager("pos", pos.win)}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Avg price</th>
                  <th>Last price</th>
                  <th>P&amp;L</th>
                  <th>Realised</th>
                  <th>Placed by</th>
                </tr>
              </thead>
              <tbody>
                {pos.rows.map(({ r, by }, i) => (
                  <tr key={`${r.symbol}-${i}`}>
                    <td className="font-semibold">{r.symbol}</td>
                    <td>{r.product ?? "—"}</td>
                    <td>{r.quantity}</td>
                    <td>{price(r.avgPrice)}</td>
                    <td>{price(r.ltp)}</td>
                    <td>{pnl(r.pnl)}</td>
                    <td>{pnl(r.realised)}</td>
                    <td>
                      <SourcePill source={by} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>
          <Part
            title="Today's orders"
            section={acct.orders}
            empty="No orders today."
            total={ordAll.length}
            shown={ord.rows.length}
            toolbar={toolbar("ord", "Search orders (stock, order id)…", [
              { name: "ordstate", label: "Status", options: [{ value: "all", label: "Any" }, { value: "open", label: "Working" }, { value: "done", label: "Filled" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }] },
              { name: "ordside", label: "Side", options: SIDES },
              { name: "ordby", label: "Placed by", options: BY },
            ])}
            pager={pager("ord", ord.win)}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Instrument</th>
                  <th>Side</th>
                  <th>Qty (filled)</th>
                  <th>Price</th>
                  <th>Avg fill</th>
                  <th>Status</th>
                  <th>Placed by</th>
                </tr>
              </thead>
              <tbody>
                {ord.rows.map(({ r, c }, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="whitespace-nowrap text-xs">{r.time ? r.time.replace("T", " ").replace(/\.\d+$/, "") : "—"}</td>
                    <td className="font-semibold">{r.symbol}</td>
                    <td className={r.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{r.side}</td>
                    <td>
                      {r.quantity} ({r.filled})
                    </td>
                    {/* A market order's "price" is the broker's protection limit, not a price anyone chose — say "Market". */}
                    <td>{/^MARKET$|^MKT$/i.test(r.orderType ?? "") ? <span title={r.price != null ? `Broker's protection limit ${price(r.price)}` : undefined}>Market</span> : price(r.price)}</td>
                    <td>{price(r.avgPrice)}</td>
                    <td className="text-xs">{r.status}</td>
                    <td>
                      <SourcePill source={c.source} strategy={c.strategyName} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>
          <Part title="Today's trades" section={acct.trades} empty="No trades today." total={trdAll.length} shown={trd.rows.length} toolbar={toolbar("trd", "Search trades…", [{ name: "trdside", label: "Side", options: SIDES }])} pager={pager("trd", trd.win)}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Instrument</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {trd.rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="whitespace-nowrap text-xs">{r.time ?? "—"}</td>
                    <td className="font-semibold">{r.symbol}</td>
                    <td className={r.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{r.side}</td>
                    <td>{r.quantity}</td>
                    <td>{price(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Part>
          <p className="text-xs text-brand-navy/45">Shown exactly as {acct.name} reports it, read when you opened this page. Your broker&apos;s own app is the final record.</p>
        </>
      )}
    </div>
  );
}
