import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import type { CandleRange } from "@/lib/market-data";
import CandlestickChart from "@/components/candlestick-chart";
import EquityCurveChart from "@/components/equity-curve-chart";
import { describePositionSizing } from "@/lib/position-sizing";
import type { Signal } from "@/lib/strategy";
import { CandlestickChart as CandleIcon, FlaskConical, LineChart, ListOrdered } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import StatusBadge from "@/components/ui/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatINR, formatPct, formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Backtest ${id}`, robots: { index: false } };
}

// `signed`: the figure is itself a gain or loss, so it's colored by sign.
// Win rate, profit factor, Sharpe and trade count are not — they stay neutral.
const METRIC_TILES = [
  { key: "totalReturnPct" as const, label: "Total return", format: "pct", signed: true },
  { key: "cagrPct" as const, label: "CAGR", format: "pct", signed: true },
  { key: "winRatePct" as const, label: "Win rate", format: "plainpct", signed: false },
  { key: "profitFactor" as const, label: "Profit factor", format: "num", signed: false },
  { key: "maxDrawdownPct" as const, label: "Max drawdown", format: "pct", signed: true },
  { key: "sharpeRatio" as const, label: "Sharpe ratio", format: "num", signed: false },
  { key: "expectancy" as const, label: "Expectancy / trade", format: "money", signed: true },
  { key: "tradeCount" as const, label: "Trades", format: "int", signed: false },
];

function formatValue(value: number, format: string) {
  if (format === "pct") return formatPct(value);
  if (format === "plainpct") return `${value.toFixed(1)}%`;
  if (format === "money") return formatSignedINR(value);
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
      <PageHeader
        eyebrow="Backtest result"
        title={run.strategyName}
        icon={FlaskConical}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-brand-navy">{run.instrumentSymbol}</span>
            <StatusBadge status={run.direction === "SHORT" ? "SHORT" : "LONG"} />
            <span>· {run.range} · started with {formatINR(run.startingCapital)} · {describePositionSizing(run.positionSizingMode, run.positionSizingValue)}</span>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRIC_TILES.map((tile) => (
          <StatCard
            key={tile.key}
            label={tile.label}
            value={formatValue(run[tile.key], tile.format)}
            tone={tile.signed ? toneOf(run[tile.key]) : undefined}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-brand-navy/45">
        Data: {marketDataProvider.name}
        {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"} · Backtested against historical data — past
        performance does not guarantee future results.
      </p>

      <Card className="mt-6 p-5">
        <CardHeader title="Equity curve" icon={LineChart} />
        <div className="mt-4">
          <EquityCurveChart points={equityCurve} />
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <CardHeader title="Price chart with executed trades" icon={CandleIcon} />
        <div className="mt-4">
          {fetchError ? <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p> : <CandlestickChart candles={candles} markers={markers} />}
        </div>
      </Card>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <ListOrdered size={16} className="text-brand-primary" />
          <h2 className="text-sm font-semibold text-brand-navy">Trade ledger</h2>
          <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{run.trades.length}</span>
        </div>
        <div className="overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Exit</th>
                <th className="num-cell">Qty</th>
                <th className="num-cell">Entry price</th>
                <th className="num-cell">Exit price</th>
                <th className="num-cell">Net P&amp;L</th>
                <th className="num-cell">P&amp;L %</th>
                <th className="num-cell">Bars held</th>
              </tr>
            </thead>
            <tbody>
              {run.trades.map((t) => {
                const tone = toneOf(t.netPnl);
                const d = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
                return (
                  <tr key={t.id}>
                    <td>{d(t.entryTime)}</td>
                    <td>{d(t.exitTime)}</td>
                    <td className="num-cell">{t.quantity}</td>
                    <td className="num-cell">₹{formatPrice(t.entryPrice)}</td>
                    <td className="num-cell">₹{formatPrice(t.exitPrice)}</td>
                    <td className={`num-cell font-semibold ${TONE_TEXT[tone]}`}>{formatSignedINR(t.netPnl, 2)}</td>
                    <td className={`num-cell ${TONE_TEXT[tone]}`}>{formatPct(t.netPnlPct)}</td>
                    <td className="num-cell text-brand-navy/60">{t.holdingBars}</td>
                  </tr>
                );
              })}
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
