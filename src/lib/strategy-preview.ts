import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { compile } from "@/lib/strategy-compile";
import { isIntraday, marketDataFor, type Candle } from "@/lib/market-data";
import { STRATEGY_TIMEFRAMES, engineSession, normalizeSession, rangeFor } from "@/lib/strategy/session";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import { runBacktest, type BacktestTradeResult } from "@/lib/backtest/run";
import { conditionToText } from "@/lib/strategy/format";
import { NEVER_EXIT_CONDITION, isNeverExitCondition, type ConditionNode } from "@/lib/strategy/types";
import { evaluateConditionsPerBar, type AuxCandleMap } from "@/lib/strategy/evaluate";
import { INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import type { StrategyInput } from "@/lib/strategy-actions";

// The strategy builder's "See it in action" demo: runs an unsaved draft
// through the same validator and backtest engine on recent data. Server-only
// — callers are responsible for authentication (see strategy-preview-actions.ts).

const PREVIEW = { range: "6mo" as const, capital: 100_000, brokeragePercent: 0.03, slippagePercent: 0.05 };

export type PreviewTrade = Pick<BacktestTradeResult, "entryTime" | "entryPrice" | "exitTime" | "exitPrice" | "quantity" | "netPnl" | "netPnlPct" | "exitReason"> & {
  /** The part of the entry rule that was true (for "A or B" rules, just the part that fired). */
  entryReason: string;
  /** Same for a rule-based exit. */
  exitRuleReason?: string;
};

export type StrategyPreview = {
  symbol: string;
  candles: Candle[];
  trades: PreviewTrade[];
  entryRule: string;
  exitRule: string | null;
  totalReturnPct: number;
  winRatePct: number;
  capital: number;
  dataSource: string;
  timeframeLabel: string;
  periodLabel: string;
  intraday: boolean;
};

const PERIOD_LABEL: Partial<Record<string, string>> = { "1d": "1 day", "5d": "5 days", "1mo": "1 month", "3mo": "3 months", "6mo": "6 months", "1y": "1 year" };

const LABEL_BY_DSL = new Map(INDICATOR_CATALOG.map((d) => [d.dslName, d.label]));

/** A rule as a person would say it: "EMA(9) crosses above EMA(21)" rather than the code form. */
function readableRule(node: ConditionNode): string {
  return conditionToText(node)
    // Time rules read as times: "the exit time 15:15 was reached", "it was the entry time (09:15–09:30)".
    .replace(/time between (\d\d:\d\d) and 15:30/g, "the exit time $1 was reached")
    .replace(/time between (\d\d:\d\d) and (\d\d:\d\d)/g, "it was the entry time ($1–$2)")
    .replace(/crossesAbove/g, "crosses above")
    .replace(/crossesBelow/g, "crosses below")
    .replace(/\b([a-z]+)\(([^)]*)\)/g, (m, name: string, args: string) => {
      const label = LABEL_BY_DSL.get(name);
      return label ? `${label}(${args.replace(/,/g, ", ")})` : m;
    });
}

/**
 * Why a rule fired on a given candle, in words. For an OR group only the parts
 * that were actually true are named; for anything else the whole rule is.
 */
function firedParts(node: ConditionNode, candles: Candle[], aux: AuxCandleMap): (barIdx: number) => string {
  const whole = readableRule(node);
  if (node.kind !== "group" || node.op !== "OR" || node.children.length < 2) return () => whole;
  const parts = node.children.map((child) => ({ text: readableRule(child), series: evaluateConditionsPerBar(candles, child, NEVER_EXIT_CONDITION, aux).entry }));
  return (barIdx) => {
    const hit = parts.filter((p) => p.series[barIdx]).map((p) => p.text);
    return hit.length ? hit.join(" and ") : whole;
  };
}

export type PreviewResult = { ok: true; preview: StrategyPreview } | { ok: false; error: string };

export async function computeStrategyPreview(userId: string | null, input: StrategyInput): Promise<PreviewResult> {
  if (input.mode === "WEBHOOK") return { ok: false, error: "Webhook strategies trade on TradingView alerts, so there's nothing to simulate here." };
  let compiled;
  try {
    // Same checks as saving, so the demo never shows a strategy that couldn't be created.
    compiled = await compile({ ...input, name: input.name.trim() || "Preview" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "This strategy isn't valid yet.";
    try {
      const issues = JSON.parse(msg) as { message?: string }[];
      if (Array.isArray(issues)) return { ok: false, error: issues.map((i) => i.message).filter(Boolean).join(" ") };
    } catch {
      /* plain message */
    }
    return { ok: false, error: msg };
  }

  try {
    const instrument = await prisma.instrument.findUnique({ where: { id: input.instrumentId }, select: { symbol: true } });
    if (!instrument) return { ok: false, error: "Choose an instrument first." };

    const session = normalizeSession(input);
    const timeframe = session.timeframe;
    const range = rangeFor(timeframe, PREVIEW.range);
    const market = marketDataFor(userId, "backtest");
    const candles = await market.getHistoricalCandles(instrument.symbol, range, timeframe);
    if (candles.length === 0) return { ok: false, error: "No recent price data for this instrument." };
    const aux = await fetchAuxCandles(compiled.entryCondition, compiled.exitCondition, instrument.symbol, range, timeframe, market);

    const leg = (l: StrategyInput["stopLoss"]) => (l.enabled ? { enabled: true, unit: l.unit, value: l.value } : null);
    const result = runBacktest(
      candles,
      compiled.entryCondition,
      compiled.exitCondition,
      {
        startingCapital: PREVIEW.capital,
        brokeragePercent: PREVIEW.brokeragePercent,
        slippagePercent: PREVIEW.slippagePercent,
        positionSizing: { mode: input.positionSizingMode, value: input.positionSizingValue },
        riskManagement: { stopLoss: leg(input.stopLoss), target: leg(input.target), trailingSl: leg(input.trailingSl) },
        maxPyramidEntries: input.maxPyramidEntries,
        direction: input.direction,
        session: engineSession(session, compiled.entryCondition),
      },
      aux,
    );

    const entryWhy = firedParts(compiled.entryCondition, candles, aux);
    const exitWhy = isNeverExitCondition(compiled.exitCondition) ? null : firedParts(compiled.exitCondition, candles, aux);
    return {
      ok: true,
      preview: {
        symbol: instrument.symbol,
        candles,
        trades: result.trades.map(({ entryTime, entryPrice, exitTime, exitPrice, quantity, netPnl, netPnlPct, exitReason }) => {
          // Fills happen at the next candle's open, so the rule was true on the candle before.
          const signalBar = (t: number) => candles.findIndex((c) => c.time === t) - 1;
          return {
            entryTime,
            entryPrice,
            exitTime,
            exitPrice,
            quantity,
            netPnl,
            netPnlPct,
            exitReason,
            entryReason: entryWhy(signalBar(entryTime)),
            ...(exitReason === "exit_rule" && exitWhy ? { exitRuleReason: exitWhy(signalBar(exitTime)) } : {}),
          };
        }),
        entryRule: readableRule(compiled.entryCondition),
        exitRule: isNeverExitCondition(compiled.exitCondition) ? null : readableRule(compiled.exitCondition),
        totalReturnPct: result.metrics.totalReturnPct,
        winRatePct: result.metrics.winRatePct,
        capital: PREVIEW.capital,
        dataSource: market.name,
        timeframeLabel: STRATEGY_TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe,
        periodLabel: PERIOD_LABEL[range] ?? range,
        intraday: isIntraday(timeframe),
      },
    };
  } catch (err) {
    logError("strategy:preview", err, { userId });
    return { ok: false, error: "We couldn't load recent price data. Please try again in a moment." };
  }
}
