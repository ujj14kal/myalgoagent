import type { CandlePatternKind } from "@/lib/candle-patterns";
import type { ChartPatternKind } from "@/lib/chart-patterns";
import type { VolumePatternKind } from "@/lib/volume-patterns";
import type { CandleInterval } from "@/lib/market-data";

export type IndicatorKind =
  | "SMA"
  | "EMA"
  | "WMA"
  | "HMA"
  | "RSI"
  | "MACD_LINE"
  | "MACD_SIGNAL"
  | "MACD_HISTOGRAM"
  | "BB_UPPER"
  | "BB_MIDDLE"
  | "BB_LOWER"
  | "VWAP"
  | "ATR"
  | "ADX"
  | "PLUS_DI"
  | "MINUS_DI"
  | "STOCH_K"
  | "STOCH_D"
  | "CCI"
  | "ROC"
  | "OBV"
  | "DONCHIAN_UPPER"
  | "DONCHIAN_LOWER"
  | "PIVOT_PP"
  | "PIVOT_R1"
  | "PIVOT_R2"
  | "PIVOT_R3"
  | "PIVOT_S1"
  | "PIVOT_S2"
  | "PIVOT_S3"
  | "PSAR"
  | "SUPERTREND"
  | "WILLIAMS_R"
  | "MFI"
  | "AWESOME_OSCILLATOR"
  | "AROON_UP"
  | "AROON_DOWN"
  | "CMF"
  | "KELTNER_UPPER"
  | "KELTNER_MIDDLE"
  | "KELTNER_LOWER"
  | "ENVELOPE_UPPER"
  | "ENVELOPE_LOWER"
  | "STDDEV";

export type PriceField = "OPEN" | "HIGH" | "LOW" | "CLOSE" | "VOLUME";
export type ComparisonOperator = "GT" | "LT" | "GTE" | "LTE" | "EQ" | "CROSSES_ABOVE" | "CROSSES_BELOW";

// `timeframe`/`instrumentSymbol` let an operand pull its series from a
// different candle interval and/or a different instrument than the
// strategy's own base chart — omitted means "use the base series," so every
// existing saved strategy keeps working unchanged.
export type Operand =
  | { kind: "indicator"; type: IndicatorKind; params: number[]; timeframe?: CandleInterval; instrumentSymbol?: string }
  | { kind: "price"; field: PriceField; timeframe?: CandleInterval; instrumentSymbol?: string }
  | { kind: "constant"; value: number };

// A "signal" is a boolean-native condition — true/false per bar — as opposed
// to a comparison, which compares two numeric time series. Time windows and
// pattern detectors (candlestick, chart, volume) are all signals: they don't
// reduce to "operand vs operand," they're computed directly as a boolean
// series.
// Pattern signals (not TIME_WINDOW, which has no meaningful "different chart"
// reading) can also opt into a different timeframe than the strategy's base
// chart — e.g. detect a bullish engulfing on the 15-minute chart while the
// strategy otherwise trades 5-minute bars. Omitted = base chart, matching the
// same convention as the operand-level timeframe override.
export type BooleanSignalKind =
  | { family: "TIME_WINDOW"; startMinute: number; endMinute: number }
  | { family: "CANDLE_PATTERN"; pattern: CandlePatternKind; timeframe?: CandleInterval }
  | { family: "CHART_PATTERN"; pattern: ChartPatternKind; timeframe?: CandleInterval }
  | { family: "VOLUME_PATTERN"; pattern: VolumePatternKind; timeframe?: CandleInterval };

export type ConditionNode =
  | { kind: "group"; op: "AND" | "OR"; children: ConditionNode[] }
  | { kind: "not"; child: ConditionNode }
  | { kind: "comparison"; left: Operand; operator: ComparisonOperator; right: Operand }
  | { kind: "signal"; signal: BooleanSignalKind };

export interface Signal {
  time: number;
  type: "entry" | "exit";
}

/** A condition that can never be true — the default exit when a strategy
 * relies purely on stop-loss/target/trailing to close a position, with no
 * condition-based exit configured at all. */
export const NEVER_EXIT_CONDITION: ConditionNode = {
  kind: "comparison",
  left: { kind: "constant", value: 0 },
  operator: "GT",
  right: { kind: "constant", value: 1 },
};

/** Separates individual feasibility issues within one thrown Error's
 * message, so the client can split them back apart and show each as its
 * own bullet in the feasibility popup. Lives here (a plain module) rather
 * than in strategy-actions.ts, since a "use server" file may only export
 * async functions — a plain constant export from it fails the build. */
export const FEASIBILITY_ISSUE_SEPARATOR = "\n";
