import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import type { CandleRange } from "@/lib/market-data";
import CandlestickChart from "@/components/candlestick-chart";
import EquityCurveChart from "@/components/equity-curve-chart";
import { describePositionSizing } from "@/components/position-sizing-fields";
import type { Signal } from "@/lib/strategy";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Backtest ${id}`, robots: { index: false } };
}

const METRIC_TILES = [
  { key: "totalReturnPct" as const, label: "Total return", format: "pct" },
  { key: "cagrPct" as const, label: "CAGR", format: "pct" },
  { key: "winRatePct" as const, label: "Win rate", format: "pct" },
  { key: "profitFactor" as const, label: "Profit factor", format: "num" },
  { key: "maxDrawdownPct" as const, label: "Max drawdown", format: "pct" },
  { key: "sharpeRatio" as const, label: "Sharpe ratio", format: "num" },
  { key: "expectancy" as const, label: "Expectancy (₹/trade)", format: "money" },
  { key: "tradeCount" as const, label: "Trades", format: "int" },
];

function formatValue(value: number, format: string) {
  if (format === "pct") return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  if (format === "money") return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (format === "int") return value.toString();
  return value.toFixed(2);
}

export default async function BacktestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const run = await prisma.backtestRun.findFirst({
    where: { id, userId: session.user.id },
    include: { trades: { orderBy: { entryTime: "asc" } } },
  });
  if (!run) notFound();

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  try {
    candles = await marketDataProvider.getHistoricalCandles(run.instrumentSymbol, run.range as CandleRange, "1d");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load market data";
  }

  const markers: Signal[] = run.trades.flatMap((t) => [
    { time: t.entryTime, type: "entry" as const },
    { time: t.exitTime, type: "exit" as const },
  ]);
  const equityCurve = run.equityCurve as unknown as { time: number; equity: number }[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">{run.strategyName}</h1>
      <p className="mt-1 text-sm text-brand-navy/60">
        {run.instrumentSymbol} · {run.range} · started with ₹{run.startingCapital.toLocaleString("en-IN")} ·
        Sizing: {describePositionSizing(run.positionSizingMode, run.positionSizingValue)}
      </p>
      <p className="mt-1 text-xs text-brand-navy/40">
        Data: {marketDataProvider.name}
        {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"}
        {" · "}Backtested against historical data — past performance does not guarantee future results.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRIC_TILES.map((tile) => (
          <div key={tile.key} className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{tile.label}</p>
            <p
              className={`mt-2 text-xl font-bold ${
                tile.format === "pct" || tile.format === "money"
                  ? run[tile.key] >= 0
                    ? "text-brand-buy"
                    : "text-brand-sell"
                  : "text-brand-navy"
              }`}
            >
              {formatValue(run[tile.key], tile.format)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Equity curve</p>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <EquityCurveChart points={equityCurve} />
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Price chart with executed trades</p>
        {fetchError ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <CandlestickChart candles={candles} markers={markers} />
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Trade ledger</p>
        <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Exit</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Entry price</th>
                <th className="px-4 py-3">Exit price</th>
                <th className="px-4 py-3">Net P&amp;L</th>
                <th className="px-4 py-3">P&amp;L %</th>
                <th className="px-4 py-3">Bars held</th>
              </tr>
            </thead>
            <tbody>
              {run.trades.map((t) => (
                <tr key={t.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2">{new Date(t.entryTime * 1000).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2">{new Date(t.exitTime * 1000).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2">{t.quantity}</td>
                  <td className="px-4 py-2">₹{t.entryPrice.toFixed(2)}</td>
                  <td className="px-4 py-2">₹{t.exitPrice.toFixed(2)}</td>
                  <td className={`px-4 py-2 font-medium ${t.netPnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                    ₹{t.netPnl.toFixed(2)}
                  </td>
                  <td className={`px-4 py-2 ${t.netPnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                    {t.netPnlPct >= 0 ? "+" : ""}
                    {t.netPnlPct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2">{t.holdingBars}</td>
                </tr>
              ))}
              {run.trades.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                    No trades triggered over this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
