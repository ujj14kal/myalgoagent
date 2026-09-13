import type { PositionSizingMode, RiskUnit } from "@/lib/trading-engine/step";

export interface StrategyExecutionConfig {
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLossEnabled: boolean;
  stopLossUnit: RiskUnit | null;
  stopLossValue: number | null;
  targetEnabled: boolean;
  targetUnit: RiskUnit | null;
  targetValue: number | null;
  trailingSlEnabled: boolean;
  trailingSlUnit: RiskUnit | null;
  trailingSlValue: number | null;
  maxPyramidEntries: number;
}

const UNIT_SUFFIX: Record<RiskUnit, string> = {
  PERCENT: "%",
  POINTS: " pts",
  ATR_MULTIPLE: "× ATR",
};

function describeLeg(enabled: boolean, unit: RiskUnit | null, value: number | null): string | null {
  if (!enabled || unit === null || value === null) return null;
  return `${value}${UNIT_SUFFIX[unit]}`;
}

const SIZING_LABEL: Record<PositionSizingMode, string> = {
  FULL_CAPITAL: "full capital per trade",
  FIXED_QUANTITY: "fixed quantity",
  FIXED_CAPITAL: "fixed capital",
  PERCENT_OF_CAPITAL: "% of capital",
};

/** Human-readable one-line summary of a strategy's fixed execution/risk
 * config — shown wherever a backtest or paper session used to let the user
 * re-enter these values, so it's clear the strategy's own settings are
 * what's actually running. */
export function describeExecutionConfig(config: StrategyExecutionConfig): string {
  const parts: string[] = [];

  const sizing = SIZING_LABEL[config.positionSizingMode];
  parts.push(
    config.positionSizingMode === "FULL_CAPITAL" || config.positionSizingValue === null
      ? sizing
      : `${sizing} (${config.positionSizingValue})`,
  );

  const stopLoss = describeLeg(config.stopLossEnabled, config.stopLossUnit, config.stopLossValue);
  const target = describeLeg(config.targetEnabled, config.targetUnit, config.targetValue);
  const trailingSl = describeLeg(config.trailingSlEnabled, config.trailingSlUnit, config.trailingSlValue);

  parts.push(stopLoss ? `${stopLoss} stop-loss` : "no stop-loss");
  parts.push(target ? `${target} target` : "no target");
  parts.push(trailingSl ? `${trailingSl} trailing stop` : "no trailing stop");
  parts.push(config.maxPyramidEntries > 1 ? `up to ${config.maxPyramidEntries} pyramided entries` : "no pyramiding");

  return parts.join(" · ");
}
