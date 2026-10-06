import MarketRefresh from "@/components/markets/auto-refresh";
import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { auth } from "@/lib/auth";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/ui/page-header";
import { readableBrokers } from "@/lib/brokers/connected";
import { loadBrokerAccount } from "@/lib/brokers/account-load";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";
import Pager from "@/components/ui/pager";
import ListToolbar from "@/components/ui/list-toolbar";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";

export const metadata = { title: "Positions", robots: { index: false } };
export const dynamic = "force-dynamic";

const price = (v: number | null) => (v == null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

/** Real open positions from the user's connected brokers. */
export default async function PositionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const brokers = await readableBrokers(userId);
  const limited = brokers.length ? await checkRateLimit(`positions:${userId}`, 20, 60_000) : null;
  const accounts = limited ? [] : await Promise.all(brokers.map((b) => loadBrokerAccount(userId, b.id, ["positions"])));
  const rows = accounts.flatMap((a) => ("error" in a || !a.positions?.ok ? [] : a.positions.data.map((p) => ({ ...p, broker: a.name }))));
  // Search, filters and paging over what the brokers returned; only the page shown is sent.
  const sp = await searchParams;
  const q = qText(sp.q)?.toLowerCase();
  const brokerName = qText(sp.broker, 40);
  const state = qEnum(sp.state, ["all", "open", "closed"] as const, "all");
  const matching = rows.filter((r) => (!q || r.symbol.toLowerCase().includes(q)) && (!brokerName || r.broker === brokerName) && (state === "all" || (state === "open" ? r.quantity !== 0 : r.quantity === 0)));
  const { page, size } = readPageQuery(sp);
  const shown = pageRows(matching, page, size);
  const params = keepParams({ q: qText(sp.q), broker: brokerName, state: state === "all" ? undefined : state, size: size === 25 ? undefined : String(size) });
  const errors = accounts.flatMap((a, i) => ("error" in a ? [`${brokers[i].name}: ${a.error}`] : a.positions && !a.positions.ok ? [`${a.name}: ${a.positions.error}`] : []));

  return (
    <div>
      <MarketRefresh seconds={5} />
      <PageHeader title="Positions" icon={BriefcaseBusiness} description="Your real positions today, as your connected brokers report them. Forward-test positions are hypothetical and are shown inside each forward test." />
      {brokers.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No broker connected for today." description="Connect a broker (or log in for today) to see your real positions." ctaLabel="Broker Connections" ctaHref="/app/broker-connections" />
        </div>
      ) : (
        <>
          {limited && <p className="mt-6 text-sm text-brand-sell">Refreshing too often — wait a moment.</p>}
          {errors.map((e) => (
            <p key={e} className="mt-4 text-sm text-brand-sell">
              {e}
            </p>
          ))}
          {rows.length === 0 && !limited ? (
            <p className="surface mt-6 p-6 text-center text-sm text-brand-navy/50">No open positions today.</p>
          ) : (
            <>
            <div className="mt-6">
              <ListToolbar
                params={params}
                search={{ placeholder: "Search positions…" }}
                selects={[
                  ...(brokers.length > 1 ? [{ name: "broker", label: "Broker", options: [{ value: "", label: "All brokers" }, ...brokers.map((b) => ({ value: b.name, label: b.name }))] }] : []),
                  { name: "state", label: "Show", options: [{ value: "all", label: "Open & closed" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed today" }] },
                ]}
              />
            </div>
            <div className="mt-3 overflow-x-auto surface">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Broker</th>
                    <th>Instrument</th>
                    <th>Product</th>
                    <th className="num-cell">Qty</th>
                    <th className="num-cell">Avg price</th>
                    <th className="num-cell">Last price</th>
                    <th className="num-cell">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.rows.map((r, i) => (
                    <tr key={`${r.broker}-${r.symbol}-${i}`}>
                      <td>{r.broker}</td>
                      <td className="font-medium">{r.symbol}</td>
                      <td className="text-xs text-brand-navy/60">{r.product ?? "—"}</td>
                      <td className="num-cell">{r.quantity}</td>
                      <td className="num-cell">{price(r.avgPrice)}</td>
                      <td className="num-cell">{price(r.ltp)}</td>
                      <td className={`num-cell font-semibold ${r.pnl == null ? "text-brand-navy/40" : TONE_TEXT[toneOf(r.pnl)]}`}>{r.pnl == null ? "—" : formatSignedINR(r.pnl, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.rows.length === 0 && <p className="p-6 text-center text-sm text-brand-navy/50">No positions match.</p>}
            </div>
            <Pager basePath="/app/positions" params={params} window={shown.win} />
            </>
          )}
          <p className="mt-3 text-xs text-brand-navy/45">
            Read-only, as your broker reports it — updated every few seconds while the market is open.{" "}
            <Link href="/app/broker-account" className="font-semibold text-brand-primary hover:underline">
              Full broker account →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
