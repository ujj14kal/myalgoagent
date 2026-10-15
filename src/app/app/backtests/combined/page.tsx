import Link from "next/link";
import AutoPager from "@/components/ui/auto-pager";
import { notFound } from "next/navigation";
import { Layers, LineChart, ListOrdered } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import EquityCurveChart from "@/components/equity-curve-chart";
import BacktestAnalytics from "@/components/backtest/analytics-panel";
import { combineEquity, combinedSummary } from "@/lib/backtest/combine";
import { formatINR, formatPct, formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = { title: "Combined backtest", robots: { index: false } };

export default async function CombinedBacktestPage({ searchParams }: { searchParams: Promise<{ ids?: string; skipped?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { ids = "", skipped } = await searchParams;
  const wanted = [...new Set(ids.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 8);
  if (wanted.length < 2) notFound();
  const found = await prisma.backtestRun.findMany({ where: { userId: session.user.id, id: { in: wanted } }, include: { trades: { orderBy: { exitTime: "asc" } } } });
  const runs = wanted.map((id) => found.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  if (runs.length < 2) notFound();

  const prepared = runs.map((r) => ({ id: r.id, name: r.strategyName, symbol: r.instrumentSymbol, startingCapital: r.startingCapital, equity: r.equityCurve as unknown as { time: number; equity: number }[], trades: r.trades }));
  const curve = combineEquity(prepared);
  const sum = combinedSummary(prepared, curve);
  const allTrades = prepared.flatMap((p) => p.trades.map((t) => ({ ...t, strategy: p.name, symbol: p.symbol }))).sort((a, b) => b.exitTime - a.exitTime);
  const d = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
  const ranges = [...new Set(runs.map((r) => r.range))].join(" / ");

  return (
    <div>
      <PageHeader
        eyebrow="Combined backtest"
        title={`${runs.length} strategies together`}
        icon={Layers}
        description={
          <span>
            {prepared.map((p) => p.name).join(" · ")} · {ranges} · {formatINR(sum.startingCapital)} in total, each strategy on its own capital
            {skipped ? ` · ${skipped} could not be run and is left out` : ""}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Combined return" value={formatPct(sum.totalReturnPct)} tone={toneOf(sum.totalReturnPct)} />
        <StatCard label="Net profit / loss" value={formatSignedINR(sum.netPnl)} tone={toneOf(sum.netPnl)} />
        <StatCard label="Max drawdown (combined)" value={`${sum.maxDrawdownPct.toFixed(2)}%`} tone="down" />
        <StatCard label="Trades (all strategies)" value={String(sum.trades)} />
      </div>
      <p className="mt-3 text-xs text-brand-navy/45">Each strategy was backtested on its own saved settings; the combined account value adds them up over time. Backtested against historical data — past performance does not guarantee future results.</p>

      <Card className="mt-6 p-5">
        <CardHeader title="Combined account value" icon={LineChart} />
        <div className="mt-4">
          <EquityCurveChart points={curve} />
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <CardHeader title="What each strategy contributed" icon={Layers} />
        <div className="mt-3 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Stock</th>
                <th className="num-cell">Trades</th>
                <th className="num-cell">Net P&amp;L</th>
                <th className="num-cell">Return</th>
                <th className="num-cell">Share of total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sum.parts.map((p) => {
                const total = sum.parts.reduce((s, x) => s + Math.abs(x.netPnl), 0);
                return (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.name}</td>
                    <td>{p.symbol}</td>
                    <td className="num-cell">{p.trades}</td>
                    <td className={`num-cell font-semibold ${TONE_TEXT[toneOf(p.netPnl)]}`}>{formatSignedINR(p.netPnl)}</td>
                    <td className={`num-cell ${TONE_TEXT[toneOf(p.returnPct)]}`}>{formatPct(p.returnPct)}</td>
                    <td className="num-cell text-brand-navy/60">{total > 0 ? `${((Math.abs(p.netPnl) / total) * 100).toFixed(0)}%` : "—"}</td>
                    <td className="text-right">
                      <Link href={`/app/backtests/${p.id}`} className="text-xs font-semibold text-brand-primary hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <BacktestAnalytics trades={allTrades} equity={curve} />

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <ListOrdered size={16} className="text-brand-primary" />
          <h2 className="text-sm font-semibold text-brand-navy">All trades, newest first</h2>
          <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{allTrades.length}</span>
        </div>
        <div className="overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Entry</th>
                <th>Exit</th>
                <th className="num-cell">Qty</th>
                <th className="num-cell">Entry price</th>
                <th className="num-cell">Exit price</th>
                <th className="num-cell">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              <AutoPager colSpan={8}>
              {allTrades.slice(0, 200).map((t) => (
                <tr key={t.id}>
                  <td className="max-w-[12rem] truncate">{t.strategy}</td>
                  <td>{d(t.entryTime)}</td>
                  <td>{d(t.exitTime)}</td>
                  <td className="num-cell">{t.quantity}</td>
                  <td className="num-cell">₹{formatPrice(t.entryPrice)}</td>
                  <td className="num-cell">₹{formatPrice(t.exitPrice)}</td>
                  <td className={`num-cell font-semibold ${TONE_TEXT[toneOf(t.netPnl)]}`}>{formatSignedINR(t.netPnl, 2)}</td>
                </tr>
              ))}
              {allTrades.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                    No trades triggered over this period.
                  </td>
                </tr>
              )}
            </AutoPager>
            </tbody>
          </table>
        </div>
        {allTrades.length > 200 && <p className="mt-2 text-xs text-brand-navy/45">Showing the latest 200 of {allTrades.length}. Open a strategy above for its full ledger.</p>}
      </div>
    </div>
  );
}
