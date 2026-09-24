import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import {
  evaluateStrategy,
  collectConditionOperands,
  computeIndicatorSeries,
  OSCILLATOR_KINDS,
  type ConditionNode,
} from "@/lib/strategy";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import CandlestickChart, { type Overlay } from "@/components/candlestick-chart";
import StrategyBuilderForm from "@/components/strategy-builder-form";
import StrategyStatusControls from "@/components/strategy-status-controls";
import WebhookPanel from "@/components/webhook-panel";
import { Layers } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBadge from "@/components/ui/status-badge";

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

  const isWebhook = strategy.mode === "WEBHOOK";
  const entryCondition = strategy.entryCondition as unknown as ConditionNode;
  const exitCondition = strategy.exitCondition as unknown as ConditionNode;

  const webhookAlerts = isWebhook
    ? await prisma.webhookAlert.findMany({
        where: { strategyId: strategy.id },
        orderBy: { receivedAt: "desc" },
        take: 20,
      })
    : [];

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  if (!isWebhook) {
    try {
      candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, "6mo", "1d");
    } catch (err) {
      fetchError = err instanceof Error ? err.message : "Failed to load market data";
    }
  }

  // A candle/chart/volume-pattern or indicator condition can reference a
  // different timeframe than this base 6mo/1d chart (e.g. a 5-minute candle
  // pattern) — that override series has to be fetched separately, or the
  // condition silently never fires on this preview (it would every bar
  // evaluate to "unknown data" and be treated as false).
  const aux =
    !isWebhook && candles.length > 0
      ? await fetchAuxCandles(entryCondition, exitCondition, strategy.instrument.symbol, "6mo", "1d")
      : new Map();

  // A webhook-mode strategy has no real condition tree (see
  // NEVER_EXIT_CONDITION usage in strategy-actions.ts) — evaluating it would
  // just show a misleadingly empty "signals preview," so skip it entirely.
  const signals = !isWebhook && candles.length > 0 ? evaluateStrategy(candles, entryCondition, exitCondition, aux) : [];

  const overlays: Overlay[] = [];
  if (!isWebhook && candles.length > 0) {
    const operands = collectConditionOperands(entryCondition, exitCondition);
    const seen = new Set<string>();
    let colorIdx = 0;
    for (const op of operands) {
      if (op.kind !== "indicator" || OSCILLATOR_KINDS.has(op.type)) continue;
      const key = `${op.type}:${op.params.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const points = computeIndicatorSeries(candles, op.type, op.params);
      overlays.push({
        label: `${op.type}(${op.params.join(",")})`,
        color: OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length],
        points,
      });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Strategy"
        title={strategy.name}
        icon={Layers}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-brand-navy">{strategy.instrument.symbol}</span>
            <span>— {strategy.instrument.name}</span>
            <StatusBadge status={strategy.direction === "SHORT" ? "SHORT" : "LONG"} />
          </span>
        }
        actions={<StrategyStatusControls strategyId={strategy.id} status={strategy.status} />}
      />

      {!isWebhook && (
        <p className="-mt-2 text-xs text-brand-navy/45">
          Data: {marketDataProvider.name}
          {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"}
          {" · "}Daily bars, not real-time · signals shown are a preview of where this
          strategy would have triggered, not a backtest of P&amp;L.
        </p>
      )}

      <div className="mt-6">
        {isWebhook ? (
          <WebhookPanel
            strategyId={strategy.id}
            initialEnabled={strategy.webhookEnabled}
            hasToken={strategy.webhookTokenHash !== null}
            alerts={webhookAlerts.map((a) => ({
              id: a.id,
              receivedAt: a.receivedAt.toISOString(),
              rawPayload: a.rawPayload,
              parsedAction: a.parsedAction,
              parseError: a.parseError,
              executed: a.executed,
            }))}
          />
        ) : fetchError ? (
          <div className="surface p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : (
          <div className="surface p-4">
            <CandlestickChart candles={candles} overlays={overlays} markers={signals} />
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-brand-navy">Edit strategy</h2>
        <div className="mt-4">
          <StrategyBuilderForm
            instruments={instruments}
            strategyId={strategy.id}
            initial={{
              name: strategy.name,
              instrumentId: strategy.instrumentId,
              mode: strategy.mode,
              direction: strategy.direction,
              entryCondition,
              exitCondition,
              entrySource: strategy.entrySource,
              exitSource: strategy.exitSource,
              positionSizingMode: strategy.positionSizingMode,
              positionSizingValue: strategy.positionSizingValue,
              stopLossEnabled: strategy.stopLossEnabled,
              stopLossUnit: strategy.stopLossUnit,
              stopLossValue: strategy.stopLossValue,
              targetEnabled: strategy.targetEnabled,
              targetUnit: strategy.targetUnit,
              targetValue: strategy.targetValue,
              trailingSlEnabled: strategy.trailingSlEnabled,
              trailingSlUnit: strategy.trailingSlUnit,
              trailingSlValue: strategy.trailingSlValue,
              maxPyramidEntries: strategy.maxPyramidEntries,
            }}
          />
        </div>
      </div>
    </div>
  );
}
