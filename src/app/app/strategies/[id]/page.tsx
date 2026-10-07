import { describeRiskOptions, parseRiskOptions } from "@/lib/trading-engine/risk-options";
import Link from "next/link";
import { describeEntryPlan } from "@/lib/describe-entry-plan";
import { describeTargets } from "@/lib/describe-targets";
import { STYLE_LABEL } from "@/lib/strategy/style";
import { parseTargets } from "@/lib/trading-engine/targets-config";
import { parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { type CandleInterval } from "@/lib/market-data";
import { rangeFor } from "@/lib/strategy/session";
import { describeExecutionConfig } from "@/lib/describe-strategy-config";
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
import GoLive from "@/components/live/go-live";
import { brokerReadiness } from "@/lib/live/broker-readiness";
import StatusBadge from "@/components/ui/status-badge";
import { parseSystemRuntime, systemConditions, systemSignalSeries } from "@/lib/system/signals";
import { userMarketDataReady } from "@/lib/market-data/for-user";

const CONFLICT_PLAIN: Record<string, string> = {
  BULLISH: "bullish takes priority",
  BEARISH: "bearish takes priority",
  FIRST: "the setup that became valid first wins",
  HIGHER_TIMEFRAME: "the concept using the longer chart wins",
  CONFIDENCE: "the side with more optional blocks present wins",
  IGNORE: "nothing is opened",
  WAIT: "nothing is opened until one side holds alone",
};
const OPPOSITE_PLAIN: Record<string, string> = { IGNORE: "ignored", EXIT: "the position is closed", REVERSE: "the position is closed and the other side opened" };

export const metadata = { title: "Strategy", robots: { index: false } };

const OVERLAY_COLORS = ["#bda360", "#466fff", "#6a35c2", "#0e1b2d"];

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const market = await userMarketDataReady(session?.user?.id, "view");
  if (!session?.user?.id) return null;

  const [strategy, instruments] = await Promise.all([
    prisma.strategy.findFirst({
      where: { id, userId: session.user.id },
      include: { instrument: true, workspaceVersion: { select: { version: true, workspaceId: true, workspace: { select: { name: true } } } } },
    }),
    prisma.instrument.findMany({
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, name: true },
    }),
  ]);
  if (!strategy) notFound();

  const isWebhook = strategy.mode === "WEBHOOK";
  const plan = parseEntryPlan(strategy.entryPlan);
  const stagedTargets = parseTargets(strategy.targetsConfig);
  const riskNotes = describeRiskOptions(parseRiskOptions(strategy.riskOptions));
  // Go live: brokers logged in today and checked ready in the last 24 hours.
  const [liveUser, liveConns, liveDeployments] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { liveTradingEnabledAt: true } }),
    prisma.brokerConnection.findMany({ where: { userId: session.user.id }, select: { broker: true, status: true, tokenExpiresAt: true, liveReadyAt: true } }),
    prisma.liveDeployment.findMany({ where: { strategyId: strategy.id, status: { in: ["ACTIVE", "PAUSED"] } }, select: { broker: true } }),
  ]);
  const goLiveBrokers = brokerReadiness(liveConns);
  // A strategy published from a trading system trades both ways: its concepts, not one entry/exit rule, decide.
  const system = parseSystemRuntime(strategy.systemRuntime);
  const entryCondition = (system ? systemConditions(system) : strategy.entryCondition) as unknown as ConditionNode;
  const exitCondition = strategy.exitCondition as unknown as ConditionNode;

  const webhookAlerts = isWebhook
    ? await prisma.webhookAlert.findMany({
        where: { strategyId: strategy.id },
        orderBy: { receivedAt: "desc" },
        take: 20,
      })
    : [];

  let candles: Awaited<ReturnType<typeof market.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  if (!isWebhook) {
    try {
      candles = await market.getHistoricalCandles(strategy.instrument.symbol, rangeFor(strategy.timeframe, "6mo", market.depth), strategy.timeframe as CandleInterval);
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
      ? await fetchAuxCandles(entryCondition, exitCondition, strategy.instrument.symbol, rangeFor(strategy.timeframe, "6mo", market.depth), strategy.timeframe as CandleInterval, market)
      : new Map();

  // A webhook-mode strategy has no real condition tree (see
  // NEVER_EXIT_CONDITION usage in strategy-actions.ts) — evaluating it would
  // just show a misleadingly empty "signals preview," so skip it entirely.
  // For a trading system the chart marks each candle a bullish concept signals (▲ entry marker) and each a bearish one does (▼ exit marker).
  const signals =
    !isWebhook && candles.length > 0
      ? system
        ? systemSignalSeries(candles, system, aux).flatMap((s, i) => [
            ...(s.bull ? [{ time: candles[i].time, type: "entry" as const }] : []),
            ...(s.bear ? [{ time: candles[i].time, type: "exit" as const }] : []),
          ])
        : evaluateStrategy(candles, entryCondition, exitCondition, aux)
      : [];

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
            {system ? (
              <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/70">Trading system · {system.allowShort ? "long & short" : "long only"}</span>
            ) : (
              <StatusBadge status={strategy.direction === "SHORT" ? "SHORT" : "LONG"} />
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isWebhook && (
              <GoLive
                strategyId={strategy.id}
                strategyName={strategy.name}
                symbol={strategy.instrument.symbol}
                brokers={goLiveBrokers}
                enabled={!!liveUser?.liveTradingEnabledAt}
                liveOn={liveDeployments.map((d) => d.broker)}
                intraday={strategy.productType === "INTRADAY"}
                blocker={!strategy.instrument.symbol.endsWith(".NS") ? "Indices can't be traded directly — live strategies trade NSE stocks." : strategy.status === "DELETED" ? "This strategy has been deleted." : null}
              />
            )}
            <StrategyStatusControls strategyId={strategy.id} status={strategy.status} />
          </div>
        }
      />

      {!isWebhook && (
        <p className="-mt-2 text-xs text-brand-navy/45">
          Data: {market.name}
          {!market.isOfficial && " (interim feed, not an official NSE/BSE source)"}
          {" · "}{describeExecutionConfig({ ...strategy, targets: parseTargets(strategy.targetsConfig), entryPlan: parseEntryPlan(strategy.entryPlan), riskOptions: parseRiskOptions(strategy.riskOptions) }).split(" · ")[0]}, not real-time · signals shown are a preview of where this
          strategy would have triggered, not a backtest of P&amp;L.
        </p>
      )}

      {(!isWebhook && (plan || stagedTargets.length > 0 || strategy.style)) || riskNotes.length > 0 ? (
        <div className="surface mb-4 space-y-3 p-4 text-sm text-brand-navy/75">
          {riskNotes.length > 0 && (
            <p>
              <span className="font-semibold text-brand-navy">Leverage &amp; limits: </span>
              {riskNotes.join(" · ")}
            </p>
          )}
          {strategy.style && (
            <p>
              <span className="font-semibold text-brand-navy">Style: </span>
              {STYLE_LABEL[strategy.style as keyof typeof STYLE_LABEL] ?? strategy.style} — held overnight, on daily candles, long only.
            </p>
          )}
          {plan && (
            <div>
              <p className="font-semibold text-brand-navy">Entry plan</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {describeEntryPlan(plan, strategy.direction).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {stagedTargets.length > 0 && (
            <div>
              <p className="font-semibold text-brand-navy">Staged targets</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {describeTargets(stagedTargets).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

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

      {system && (
        <div className="mt-10 surface p-5 text-sm text-brand-navy/70">
          <p className="font-semibold text-brand-navy">What this trading system does</p>
          <p className="mt-1 text-xs text-brand-navy/50">The chart marks ▲ where a bullish concept signals and ▼ where a bearish one does. What each signal does to a position is decided by the system&apos;s rules below.</p>
          <ul className="mt-3 space-y-1.5">
            {system.concepts.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={`shrink-0 font-semibold ${c.side === "BEARISH" ? "text-brand-sell" : "text-brand-buy"}`}>{c.side === "BEARISH" ? "▼ Bearish" : "▲ Bullish"}</span>
                <span>
                  <span className="font-medium text-brand-navy">{c.name}</span>
                  <span className="text-brand-navy/55"> — {c.role === "EXIT" ? `only closes ${c.side === "BEARISH" ? "longs" : "shorts"}` : `opens ${c.side === "BEARISH" ? "shorts" : "longs"}`}</span>
                  {c.entry && (c.entry.trigger === "WHILE_VALID" || c.entry.confirmBars > 0) && (
                    <span className="text-brand-navy/55"> · {c.entry.trigger === "WHILE_VALID" ? "signals on every candle it holds" : "signals once"}{c.entry.confirmBars > 0 ? `, after holding ${c.entry.confirmBars} more candle${c.entry.confirmBars === 1 ? "" : "s"}` : ""}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs">
            <span className="font-semibold text-brand-navy">Both sides valid at once while flat:</span> {CONFLICT_PLAIN[system.conflict.rule]}{system.conflict.rule === "WAIT" ? ` (${system.conflict.confirmBars} candles)` : ""}.{" "}
            <span className="font-semibold text-brand-navy">Long + bearish setup:</span> {OPPOSITE_PLAIN[system.opposite.whenLong]}. <span className="font-semibold text-brand-navy">Short + bullish setup:</span> {OPPOSITE_PLAIN[system.opposite.whenShort]}
            {system.opposite.confirmBars > 0 ? ` (after it holds ${system.opposite.confirmBars} candle${system.opposite.confirmBars === 1 ? "" : "s"})` : ""}.
          </p>
        </div>
      )}
      {strategy.workspaceVersion && (
        <div className="mt-6 surface p-5 text-sm text-brand-navy/70">
          <p className="font-semibold text-brand-navy">Built from a workspace</p>
          <p className="mt-1">
            This is version {strategy.workspaceVersion.version} of{" "}
            <Link href={`/app/workspaces/${strategy.workspaceVersion.workspaceId}`} className="font-semibold text-brand-primary hover:underline">
              {strategy.workspaceVersion.workspace.name}
            </Link>
            . Its rules come from the workspace, so it can&apos;t be edited here: change the workspace and publish a new version. You can still backtest it, forward test it and take it live from this page.
          </p>
        </div>
      )}
      {!strategy.workspaceVersion && (
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
              timeframe: strategy.timeframe,
              noEntryAfterMinute: strategy.noEntryAfterMinute,
              squareOffMinute: strategy.squareOffMinute,
              productType: strategy.productType,
              orderType: strategy.orderType,
              limitMode: strategy.limitMode,
              limitValue: strategy.limitValue,
              style: strategy.style,
              targets: parseTargets(strategy.targetsConfig),
              riskOptions: parseRiskOptions(strategy.riskOptions),
              entryPlan: parseEntryPlan(strategy.entryPlan) ?? null,
            }}
          />
        </div>
      </div>
      )}
    </div>
  );
}
