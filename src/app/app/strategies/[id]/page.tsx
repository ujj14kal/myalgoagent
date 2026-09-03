import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { sma, ema } from "@/lib/indicators";
import { evaluateStrategy, collectConditionOperands, type ConditionNode } from "@/lib/strategy";
import CandlestickChart, { type Overlay } from "@/components/candlestick-chart";
import StrategyBuilderForm from "@/components/strategy-builder-form";
import StrategyStatusControls from "@/components/strategy-status-controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Strategy ${id}`, robots: { index: false } };
}

const OVERLAY_COLORS = ["#bda360", "#466fff", "#6a35c2", "#0e1b2d"];

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [strategy, instruments] = await Promise.all([
    prisma.strategy.findFirst({
      where: { id, userId: session.user.id },
      include: { instrument: true },
    }),
    prisma.instrument.findMany({
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, name: true },
    }),
  ]);
  if (!strategy) notFound();

  const entryCondition = strategy.entryCondition as unknown as ConditionNode;
  const exitCondition = strategy.exitCondition as unknown as ConditionNode;

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  try {
    candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, "6mo", "1d");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load market data";
  }

  const signals = candles.length > 0 ? evaluateStrategy(candles, entryCondition, exitCondition) : [];

  const overlays: Overlay[] = [];
  if (candles.length > 0) {
    const operands = collectConditionOperands(entryCondition, exitCondition);
    const seen = new Set<string>();
    let colorIdx = 0;
    for (const op of operands) {
      if (op.kind !== "indicator" || op.type === "RSI") continue;
      const key = `${op.type}:${op.period}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const points = op.type === "SMA" ? sma(candles, op.period) : ema(candles, op.period);
      overlays.push({
        label: `${op.type}(${op.period})`,
        color: OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length],
        points,
      });
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{strategy.name}</h1>
          <p className="mt-1 text-sm text-brand-navy/60">
            {strategy.instrument.symbol} — {strategy.instrument.name}
          </p>
        </div>
        <StrategyStatusControls strategyId={strategy.id} status={strategy.status} />
      </div>

      <p className="mt-1 text-xs text-brand-navy/40">
        Data: {marketDataProvider.name}
        {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"}
        {" · "}Daily bars, not real-time · signals shown are a preview of where this
        strategy would have triggered, not a backtest of P&amp;L.
      </p>

      <div className="mt-6">
        {fetchError ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <CandlestickChart candles={candles} overlays={overlays} markers={signals} />
          </div>
        )}
      </div>

      <div className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold text-brand-navy">Edit strategy</h2>
        <div className="mt-4">
          <StrategyBuilderForm
            instruments={instruments}
            strategyId={strategy.id}
            initial={{
              name: strategy.name,
              instrumentId: strategy.instrumentId,
              mode: strategy.mode,
              entryCondition,
              exitCondition,
              entrySource: strategy.entrySource,
              exitSource: strategy.exitSource,
            }}
          />
        </div>
      </div>
    </div>
  );
}
