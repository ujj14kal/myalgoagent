import type { IndicatorKind } from "./types";

export interface IndicatorDef {
  kind: IndicatorKind;
  /** lowercase identifier used in the code-mode DSL, e.g. "macdline" */
  dslName: string;
  /** human label for the visual builder's dropdown */
  label: string;
  /** one entry per required numeric argument, e.g. ["Fast", "Slow", "Signal"] */
  paramLabels: string[];
  /** sensible starting values for the visual builder */
  defaults: number[];
}

export const INDICATOR_CATALOG: IndicatorDef[] = [
  { kind: "SMA", dslName: "sma", label: "SMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "EMA", dslName: "ema", label: "EMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "WMA", dslName: "wma", label: "WMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "HMA", dslName: "hma", label: "Hull MA", paramLabels: ["Period"], defaults: [20] },
  { kind: "RSI", dslName: "rsi", label: "RSI", paramLabels: ["Period"], defaults: [14] },
  { kind: "MACD_LINE", dslName: "macdline", label: "MACD Line", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "MACD_SIGNAL", dslName: "macdsignal", label: "MACD Signal", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "MACD_HISTOGRAM", dslName: "macdhistogram", label: "MACD Histogram", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "BB_UPPER", dslName: "bollingerupper", label: "Bollinger Upper", paramLabels: ["Period", "Std Dev"], defaults: [20, 2] },
  { kind: "BB_MIDDLE", dslName: "bollingermiddle", label: "Bollinger Middle", paramLabels: ["Period", "Std Dev"], defaults: [20, 2] },
  { kind: "BB_LOWER", dslName: "bollingerlower", label: "Bollinger Lower", paramLabels: ["Period", "Std Dev"], defaults: [20, 2] },
  { kind: "VWAP", dslName: "vwap", label: "VWAP", paramLabels: [], defaults: [] },
  { kind: "ATR", dslName: "atr", label: "ATR", paramLabels: ["Period"], defaults: [14] },
  { kind: "ADX", dslName: "adx", label: "ADX", paramLabels: ["Period"], defaults: [14] },
  { kind: "PLUS_DI", dslName: "plusdi", label: "+DI", paramLabels: ["Period"], defaults: [14] },
  { kind: "MINUS_DI", dslName: "minusdi", label: "-DI", paramLabels: ["Period"], defaults: [14] },
  { kind: "STOCH_K", dslName: "stochk", label: "Stochastic %K", paramLabels: ["%K Period", "%D Period"], defaults: [14, 3] },
  { kind: "STOCH_D", dslName: "stochd", label: "Stochastic %D", paramLabels: ["%K Period", "%D Period"], defaults: [14, 3] },
  { kind: "CCI", dslName: "cci", label: "CCI", paramLabels: ["Period"], defaults: [20] },
  { kind: "ROC", dslName: "roc", label: "Rate of Change", paramLabels: ["Period"], defaults: [12] },
  { kind: "OBV", dslName: "obv", label: "On-Balance Volume", paramLabels: [], defaults: [] },
  { kind: "DONCHIAN_UPPER", dslName: "donchianupper", label: "Donchian Upper", paramLabels: ["Period"], defaults: [20] },
  { kind: "DONCHIAN_LOWER", dslName: "donchianlower", label: "Donchian Lower", paramLabels: ["Period"], defaults: [20] },
  { kind: "PIVOT_PP", dslName: "pivotpp", label: "Pivot Point", paramLabels: [], defaults: [] },
  { kind: "PIVOT_R1", dslName: "pivotr1", label: "Pivot R1", paramLabels: [], defaults: [] },
  { kind: "PIVOT_R2", dslName: "pivotr2", label: "Pivot R2", paramLabels: [], defaults: [] },
  { kind: "PIVOT_R3", dslName: "pivotr3", label: "Pivot R3", paramLabels: [], defaults: [] },
  { kind: "PIVOT_S1", dslName: "pivots1", label: "Pivot S1", paramLabels: [], defaults: [] },
  { kind: "PIVOT_S2", dslName: "pivots2", label: "Pivot S2", paramLabels: [], defaults: [] },
  { kind: "PIVOT_S3", dslName: "pivots3", label: "Pivot S3", paramLabels: [], defaults: [] },
  { kind: "PSAR", dslName: "parabolicsar", label: "Parabolic SAR", paramLabels: ["Step", "Max"], defaults: [0.02, 0.2] },
  { kind: "SUPERTREND", dslName: "supertrend", label: "Supertrend", paramLabels: ["Period", "Multiplier"], defaults: [10, 3] },
  { kind: "WILLIAMS_R", dslName: "williamsr", label: "Williams %R", paramLabels: ["Period"], defaults: [14] },
  { kind: "MFI", dslName: "mfi", label: "Money Flow Index", paramLabels: ["Period"], defaults: [14] },
  { kind: "AWESOME_OSCILLATOR", dslName: "awesomeoscillator", label: "Awesome Oscillator", paramLabels: [], defaults: [] },
  { kind: "AROON_UP", dslName: "aroonup", label: "Aroon Up", paramLabels: ["Period"], defaults: [25] },
  { kind: "AROON_DOWN", dslName: "aroondown", label: "Aroon Down", paramLabels: ["Period"], defaults: [25] },
  { kind: "CMF", dslName: "chaikinmoneyflow", label: "Chaikin Money Flow", paramLabels: ["Period"], defaults: [20] },
  { kind: "KELTNER_UPPER", dslName: "keltnerupper", label: "Keltner Upper", paramLabels: ["Period", "ATR Mult"], defaults: [20, 2] },
  { kind: "KELTNER_MIDDLE", dslName: "keltnermiddle", label: "Keltner Middle", paramLabels: ["Period", "ATR Mult"], defaults: [20, 2] },
  { kind: "KELTNER_LOWER", dslName: "keltnerlower", label: "Keltner Lower", paramLabels: ["Period", "ATR Mult"], defaults: [20, 2] },
  { kind: "ENVELOPE_UPPER", dslName: "envelopeupper", label: "Envelope Upper", paramLabels: ["Period", "Percent"], defaults: [20, 2.5] },
  { kind: "ENVELOPE_LOWER", dslName: "envelopelower", label: "Envelope Lower", paramLabels: ["Period", "Percent"], defaults: [20, 2.5] },
  { kind: "STDDEV", dslName: "stddev", label: "Std Deviation", paramLabels: ["Period"], defaults: [20] },
];

export const INDICATOR_BY_KIND: Map<IndicatorKind, IndicatorDef> = new Map(
  INDICATOR_CATALOG.map((d) => [d.kind, d]),
);
export const INDICATOR_BY_DSL_NAME: Map<string, IndicatorDef> = new Map(
  INDICATOR_CATALOG.map((d) => [d.dslName, d]),
);

/** Indicators on their own scale (0-100, +/-, unbounded volume, etc.) rather
 * than the instrument's price — these don't make sense drawn as a line over
 * a candlestick chart, only the price-scale ones do. */
export const OSCILLATOR_KINDS: Set<IndicatorKind> = new Set([
  "RSI",
  "MACD_LINE",
  "MACD_SIGNAL",
  "MACD_HISTOGRAM",
  "ADX",
  "PLUS_DI",
  "MINUS_DI",
  "STOCH_K",
  "STOCH_D",
  "CCI",
  "ROC",
  "OBV",
  "WILLIAMS_R",
  "MFI",
  "AWESOME_OSCILLATOR",
  "AROON_UP",
  "AROON_DOWN",
  "CMF",
]);
