import "server-only";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toRiskLeg, type EntryPlan, type PositionSizingMode, type RiskLegInput, type TargetLevel } from "@/lib/trading-engine/step";
import { entryPlanToStore } from "@/lib/trading-engine/entry-plan-config";
import { parseStyle, styleProblem, type StrategyStyle } from "@/lib/strategy/style";
import { targetsToStore } from "@/lib/trading-engine/targets-config";
import { DEFAULT_RISK_OPTIONS, isDefaultRiskOptions, parseRiskOptions, riskOptionsProblem, type RiskOptions } from "@/lib/trading-engine/risk-options";
import { compile } from "@/lib/strategy-compile";
import { normalizeSession } from "@/lib/strategy/session";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import type { ConditionNode } from "@/lib/strategy";
import { Prisma } from "@prisma/client";

// Writing a strategy row: shared by the builder's server actions (strategy-actions.ts) and by workspaces, which compile
// into an ordinary strategy. Not a Server Actions file, so it can export plain functions.

export interface StrategyInput {
  name: string;
  instrumentId: string;
  mode: "NO_CODE" | "CODE" | "WEBHOOK";
  direction: "LONG" | "SHORT";
  entryCondition?: ConditionNode;
  exitCondition?: ConditionNode;
  entrySource?: string;
  exitSource?: string;
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLoss: RiskLegInput;
  target: RiskLegInput;
  /** Staged Target 1–3 (each sells a share of the position and locks profit on the rest); replaces the single take-profit. */
  targets?: TargetLevel[];
  /** Swing: held for days to weeks. Runs on daily or weekly candles as long-only delivery. */
  style?: StrategyStyle;
  /** Multi-level entry: the signal buys `firstPercent` of the planned size, each level buys its share as price reaches it; `maxHoldDays` closes the position after that many trading days. */
  entryPlan?: EntryPlan;
  trailingSl: RiskLegInput;
  maxPyramidEntries: number;
  /** Candle timeframe the strategy runs on; omitted = daily. */
  timeframe?: string;
  /** Intraday only (IST minute of day): no new entries at/after it. */
  noEntryAfterMinute?: number | null;
  /** Intraday only (IST minute of day): open positions are closed at it. */
  squareOffMinute?: number | null;
  /** INTRADAY or DELIVERY (MTF: later, per broker); omitted = from the timeframe. */
  productType?: string;
  /** MARKET (default) or LIMIT; a limit is a % from the signal price or a fixed ₹ price. */
  orderType?: string;
  limitMode?: string | null;
  limitValue?: number | null;
  /** TP/SL reference (price or margin), intraday leverage, break-even and the system's daily-loss / drawdown limits. */
  riskOptions?: RiskOptions;
}

export function riskFields(input: StrategyInput) {
  const stopLoss = toRiskLeg(input.stopLoss);
  const target = toRiskLeg(input.target);
  const trailingSl = toRiskLeg(input.trailingSl);
  const staged = targetsToStore(input.targets, target.enabled);
  if (staged.error) throw new Error(staged.error);
  if (staged.json && input.mode === "WEBHOOK") throw new Error("Targets 1–3 aren't available for webhook strategies.");
  const session = normalizeSession(input);
  const style = parseStyle(input.style);
  const styleIssue = styleProblem(style, { timeframe: session.timeframe, productType: session.productType, direction: input.direction });
  if (styleIssue) throw new Error(styleIssue);
  // R multiples are a multiple of the stop-loss distance: targets only, and only with a stop-loss.
  if (stopLoss.enabled && stopLoss.unit === "R_MULTIPLE") throw new Error("The stop-loss can't be set in R — R is the stop-loss distance. Use %, points or ATR.");
  if (trailingSl.enabled && trailingSl.unit === "R_MULTIPLE") throw new Error("The trailing stop can't be set in R. Use %, points or ATR.");
  const usesR = (target.enabled && target.unit === "R_MULTIPLE") || (input.targets ?? []).some((t) => t.unit === "R_MULTIPLE");
  if (usesR && !stopLoss.enabled) throw new Error("A target set as a risk/reward multiple (R) needs a stop-loss: R is the stop-loss distance.");
  const options = input.riskOptions ? parseRiskOptions(input.riskOptions) : DEFAULT_RISK_OPTIONS;
  const optionsIssue = riskOptionsProblem(options, { productType: session.productType, stopLossOn: stopLoss.enabled });
  if (optionsIssue) throw new Error(optionsIssue);
  if ((options.breakEven || options.maxDailyLossPercent != null || options.maxDrawdownPercent != null) && input.mode === "WEBHOOK") throw new Error("Break-even and the daily-loss / drawdown limits aren't available for webhook strategies (their trades come straight from TradingView alerts).");
  const plan = entryPlanToStore(input.entryPlan, input.maxPyramidEntries);
  if (plan.error) throw new Error(plan.error);
  if (plan.json && input.mode === "WEBHOOK") throw new Error("Entry plans aren't available for webhook strategies.");
  return {
    style,
    entryPlan: plan.json ? (plan.json as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    targetsConfig: staged.json ? (staged.json as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    riskOptions: isDefaultRiskOptions(options) ? Prisma.DbNull : (options as unknown as Prisma.InputJsonValue),
    direction: input.direction,
    positionSizingMode: input.positionSizingMode,
    positionSizingValue: input.positionSizingValue,
    stopLossEnabled: stopLoss.enabled,
    stopLossUnit: stopLoss.enabled ? stopLoss.unit : null,
    stopLossValue: stopLoss.enabled ? stopLoss.value : null,
    targetEnabled: target.enabled,
    targetUnit: target.enabled ? target.unit : null,
    targetValue: target.enabled ? target.value : null,
    trailingSlEnabled: trailingSl.enabled,
    trailingSlUnit: trailingSl.enabled ? trailingSl.unit : null,
    trailingSlValue: trailingSl.enabled ? trailingSl.value : null,
    maxPyramidEntries: input.maxPyramidEntries,
    ...normalizeSession(input),
  };
}

/** Shared by createStrategy (returns the new id on success) and
 * autoSaveDraftStrategy (doesn't — see its own comment for why). Every
 * new strategy starts DRAFT by default (the schema default), which is
 * exactly the state an auto-saved in-progress one should be in too. */
export async function createStrategyRow(
  input: StrategyInput,
  userId: string,
  extra: Partial<Prisma.StrategyUncheckedCreateInput> = {},
): Promise<{ id: string } | { error: string }> {
  try {
    await enforceRateLimit(`strategy-write:${userId}`, 30, 60_000);
    const compiled = await compile(input);
    const name = input.name.trim();

    const strategy = await prisma.strategy.create({
      data: {
        userId,
        instrumentId: input.instrumentId,
        name,
        nameNormalized: name.toLowerCase(),
        mode: input.mode,
        entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
        entrySource: compiled.entrySource,
        exitSource: compiled.exitSource,
        ...riskFields(input),
        ...extra,
      },
    });
    return { id: strategy.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

