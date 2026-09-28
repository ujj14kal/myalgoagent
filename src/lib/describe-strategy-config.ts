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
  timeframe?: string;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
  productType?: string;
  orderType?: string;
  limitMode?: string | null;
  limitValue?: number | null;
}

const TIMEFRAME_LABEL: Record<string, string> = { "1m": "1-minute", "3m": "3-minute", "5m": "5-minute", "15m": "15-minute", "30m": "30-minute", "60m": "1-hour", "4h": "4-hour", "1d": "daily" };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
 * config — shown wherever a backtest or forward test used to let the user
 * re-enter these values, so it's clear the strategy's own settings are
 * what's actually running. */
export function describeExecutionConfig(config: StrategyExecutionConfig): string {
  const parts: string[] = [];
  if (config.timeframe) parts.push(`${TIMEFRAME_LABEL[config.timeframe] ?? config.timeframe} candles`);
  if (config.productType) parts.push(config.productType === "INTRADAY" ? "intraday" : "delivery");
  if (config.orderType === "LIMIT" && config.limitValue != null) {
    parts.push(config.limitMode === "PRICE" ? `limit entry at ₹${config.limitValue}` : `limit entry ${config.limitValue}% from the signal price`);
  }

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
  if (config.noEntryAfterMinute != null) parts.push(`no entries after ${hhmm(config.noEntryAfterMinute)}`);
  if (config.squareOffMinute != null) parts.push(`square-off at ${hhmm(config.squareOffMinute)}`);

  return parts.join(" · ");
}
