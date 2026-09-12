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
export type BooleanSignalKind =
  | { family: "TIME_WINDOW"; startMinute: number; endMinute: number }
  | { family: "CANDLE_PATTERN"; pattern: CandlePatternKind }
  | { family: "CHART_PATTERN"; pattern: ChartPatternKind }
  | { family: "VOLUME_PATTERN"; pattern: VolumePatternKind };

export type ConditionNode =
  | { kind: "group"; op: "AND" | "OR"; children: ConditionNode[] }
  | { kind: "not"; child: ConditionNode }
  | { kind: "comparison"; left: Operand; operator: ComparisonOperator; right: Operand }
  | { kind: "signal"; signal: BooleanSignalKind };

export interface Signal {
  time: number;
  type: "entry" | "exit";
}
