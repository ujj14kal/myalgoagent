import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { compile } from "@/lib/strategy-compile";
import { marketDataFor, type Candle } from "@/lib/market-data";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import { runBacktest, type BacktestTradeResult } from "@/lib/backtest/run";
import { conditionToText } from "@/lib/strategy/format";
import { isNeverExitCondition, type ConditionNode } from "@/lib/strategy/types";
import { INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import type { StrategyInput } from "@/lib/strategy-actions";

// The strategy builder's "See it in action" demo: runs an unsaved draft
// through the same validator and backtest engine on recent data. Server-only
// — callers are responsible for authentication (see strategy-preview-actions.ts).

const PREVIEW = { range: "6mo" as const, capital: 100_000, brokeragePercent: 0.03, slippagePercent: 0.05 };

export type PreviewTrade = Pick<BacktestTradeResult, "entryTime" | "entryPrice" | "exitTime" | "exitPrice" | "quantity" | "netPnl" | "netPnlPct" | "exitReason">;

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
};

const LABEL_BY_DSL = new Map(INDICATOR_CATALOG.map((d) => [d.dslName, d.label]));

/** A rule as a person would say it: "EMA(9) crosses above EMA(21)" rather than the code form. */
function readableRule(node: ConditionNode): string {
  return conditionToText(node)
    .replace(/crossesAbove/g, "crosses above")
    .replace(/crossesBelow/g, "crosses below")
    .replace(/\b([a-z]+)\(([^)]*)\)/g, (m, name: string, args: string) => {
      const label = LABEL_BY_DSL.get(name);
      return label ? `${label}(${args.replace(/,/g, ", ")})` : m;
    });
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

    const market = marketDataFor(userId, "backtest");
    const candles = await market.getHistoricalCandles(instrument.symbol, PREVIEW.range, "1d");
    if (candles.length === 0) return { ok: false, error: "No recent price data for this instrument." };
    const aux = await fetchAuxCandles(compiled.entryCondition, compiled.exitCondition, instrument.symbol, PREVIEW.range, "1d", market);

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
      },
      aux,
    );

    return {
      ok: true,
      preview: {
        symbol: instrument.symbol,
        candles,
        trades: result.trades.map(({ entryTime, entryPrice, exitTime, exitPrice, quantity, netPnl, netPnlPct, exitReason }) => ({
          entryTime,
          entryPrice,
          exitTime,
          exitPrice,
          quantity,
          netPnl,
          netPnlPct,
          exitReason,
        })),
        entryRule: readableRule(compiled.entryCondition),
        exitRule: isNeverExitCondition(compiled.exitCondition) ? null : readableRule(compiled.exitCondition),
        totalReturnPct: result.metrics.totalReturnPct,
        winRatePct: result.metrics.winRatePct,
        capital: PREVIEW.capital,
        dataSource: market.name,
      },
    };
  } catch (err) {
    logError("strategy:preview", err, { userId });
    return { ok: false, error: "We couldn't load recent price data. Please try again in a moment." };
  }
}
