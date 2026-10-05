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

function Part<T>({ title, section, empty, children }: { title: string; section: Section<T>; empty: string; children: (data: T) => React.ReactNode }) {
  if (section === null) return null;
  return (
    <section className="surface overflow-hidden">
      <p className="border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">{title}</p>
      {!section.ok ? (
        <p className="px-4 py-5 text-sm text-brand-sell">{section.error}</p>
      ) : Array.isArray(section.data) && section.data.length === 0 ? (
        <p className="px-4 py-5 text-sm text-brand-navy/45">{empty}</p>
      ) : (
        <div className="overflow-x-auto">{children(section.data)}</div>
      )}
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ broker?: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const now = new Date();
  const conns = await prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true }, orderBy: { createdAt: "asc" } });
  const usable = conns.filter((c) => c.status === "CONNECTED" && c.tokenExpiresAt && c.tokenExpiresAt > now && ACCOUNT_READERS[c.broker as keyof typeof ACCOUNT_READERS]);
  const { broker: asked } = await searchParams;
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
          <Part title="Holdings" section={acct.holdings} empty="No holdings.">
            {(h) => (
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
                  {h.map((r, i) => (
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
            )}
          </Part>
          <Part title="Positions" section={acct.positions} empty="No open positions today.">
            {(p) => (
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
                  {p.map((r, i) => (
                    <tr key={`${r.symbol}-${i}`}>
                      <td className="font-semibold">{r.symbol}</td>
                      <td>{r.product ?? "—"}</td>
                      <td>{r.quantity}</td>
                      <td>{price(r.avgPrice)}</td>
                      <td>{price(r.ltp)}</td>
                      <td>{pnl(r.pnl)}</td>
                      <td>{pnl(r.realised)}</td>
                      <td>
                        <SourcePill source={classifyPosition(r, ours, now)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Part>
          <Part title="Today's orders" section={acct.orders} empty="No orders today.">
            {(o) => (
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
                  {o.map((r, i) => (
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
                        {(() => {
                          const c = classifyOrder(r, ours);
                          return <SourcePill source={c.source} strategy={c.strategyName} />;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Part>
          <Part title="Today's trades" section={acct.trades} empty="No trades today.">
            {(tr) => (
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
                  {tr.map((r, i) => (
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
            )}
          </Part>
          <p className="text-xs text-brand-navy/45">Shown exactly as {acct.name} reports it, read when you opened this page. Your broker&apos;s own app is the final record.</p>
        </>
      )}
    </div>
  );
}
