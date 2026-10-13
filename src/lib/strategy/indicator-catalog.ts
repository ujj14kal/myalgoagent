import type { IndicatorKind, Operand } from "./types";

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
  /**
   * Settings from this position on are optional: strategies saved before they existed (or typed in code without them) keep the
   * defaults, and 0 is a valid choice for them (0 = the first option, e.g. "Close" or "Wilder").
   */
  optionalFrom?: number;
  /** Settings that are a pick from a short list rather than a number: shown as a dropdown. Keyed by position. */
  options?: Record<number, { value: number; label: string }[]>;
  /** Highest value a setting may take, by position (default 500; prices and dates need more). */
  maxes?: Record<number, number>;
}

export const SOURCE_OPTIONS = [
  { value: 0, label: "Close" },
  { value: 1, label: "High+Low / 2" },
  { value: 2, label: "High+Low+Close / 3" },
  { value: 3, label: "Open+High+Low+Close / 4" },
];
const RSI_SMOOTHING = [
  { value: 0, label: "Wilder (standard)" },
  { value: 1, label: "Simple average" },
  { value: 2, label: "Exponential average" },
];
const MACD_MA = [
  { value: 0, label: "EMA (standard)" },
  { value: 1, label: "SMA" },
];
const BB_MA = [
  { value: 0, label: "SMA (standard)" },
  { value: 1, label: "EMA" },
  { value: 2, label: "WMA" },
];
export const MAX_PRICE_PARAM = 10_000_000;

/** The setting values to use for an indicator: what was given, with any missing optional ones filled from the defaults. */
export function withDefaultParams(def: IndicatorDef, params: number[]): number[] {
  return def.paramLabels.map((_, i) => (Number.isFinite(params[i]) ? params[i] : def.defaults[i]));
}
/** How many settings a rule must give: all of them, unless the later ones are optional. */
export const requiredParamCount = (def: IndicatorDef) => def.optionalFrom ?? def.paramLabels.length;

export const INDICATOR_CATALOG: IndicatorDef[] = [
  { kind: "SMA", dslName: "sma", label: "SMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "EMA", dslName: "ema", label: "EMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "WMA", dslName: "wma", label: "WMA", paramLabels: ["Period"], defaults: [20] },
  { kind: "HMA", dslName: "hma", label: "Hull MA", paramLabels: ["Period"], defaults: [20] },
  { kind: "RSI", dslName: "rsi", label: "RSI", paramLabels: ["Period", "Source", "Smoothing"], defaults: [14, 0, 0], optionalFrom: 1, options: { 1: SOURCE_OPTIONS, 2: RSI_SMOOTHING } },
  { kind: "MACD_LINE", dslName: "macdline", label: "MACD Line", paramLabels: ["Fast", "Slow", "Signal", "Source", "Average type"], defaults: [12, 26, 9, 0, 0], optionalFrom: 3, options: { 3: SOURCE_OPTIONS, 4: MACD_MA } },
  { kind: "MACD_SIGNAL", dslName: "macdsignal", label: "MACD Signal", paramLabels: ["Fast", "Slow", "Signal", "Source", "Average type"], defaults: [12, 26, 9, 0, 0], optionalFrom: 3, options: { 3: SOURCE_OPTIONS, 4: MACD_MA } },
  { kind: "MACD_HISTOGRAM", dslName: "macdhistogram", label: "MACD Histogram", paramLabels: ["Fast", "Slow", "Signal", "Source", "Average type"], defaults: [12, 26, 9, 0, 0], optionalFrom: 3, options: { 3: SOURCE_OPTIONS, 4: MACD_MA } },
  { kind: "BB_UPPER", dslName: "bollingerupper", label: "Bollinger Upper", paramLabels: ["Period", "Std Dev", "Source", "Average type"], defaults: [20, 2, 0, 0], optionalFrom: 2, options: { 2: SOURCE_OPTIONS, 3: BB_MA } },
  { kind: "BB_MIDDLE", dslName: "bollingermiddle", label: "Bollinger Middle", paramLabels: ["Period", "Std Dev", "Source", "Average type"], defaults: [20, 2, 0, 0], optionalFrom: 2, options: { 2: SOURCE_OPTIONS, 3: BB_MA } },
  { kind: "BB_LOWER", dslName: "bollingerlower", label: "Bollinger Lower", paramLabels: ["Period", "Std Dev", "Source", "Average type"], defaults: [20, 2, 0, 0], optionalFrom: 2, options: { 2: SOURCE_OPTIONS, 3: BB_MA } },
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
  // Swing-based levels (see lib/support-resistance.ts): Strength = bars either side
  // that confirm a swing low/high, Touches = swings needed to form a level,
  // Zone % = how close prices must be to count as the same level.
  { kind: "SUPPORT", dslName: "support", label: "Support level", paramLabels: ["Strength", "Touches", "Zone %"], defaults: [5, 2, 1] },
  { kind: "RESISTANCE", dslName: "resistance", label: "Resistance level", paramLabels: ["Strength", "Touches", "Zone %"], defaults: [5, 2, 1] },
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
  { kind: "BB_PERCENT_B", dslName: "bollingerpercentb", label: "Bollinger %B", paramLabels: ["Period", "Std Dev", "Source", "Average type"], defaults: [20, 2, 0, 0], optionalFrom: 2, options: { 2: SOURCE_OPTIONS, 3: BB_MA } },
  { kind: "BB_BANDWIDTH", dslName: "bollingerbandwidth", label: "Bollinger BandWidth %", paramLabels: ["Period", "Std Dev", "Source", "Average type"], defaults: [20, 2, 0, 0], optionalFrom: 2, options: { 2: SOURCE_OPTIONS, 3: BB_MA } },
  { kind: "BB_SQUEEZE", dslName: "bollingersqueeze", label: "Bollinger squeeze (narrowest bands)", paramLabels: ["Period", "Std Dev", "Lookback", "Percentile"], defaults: [20, 2, 120, 15] },
  { kind: "BB_KC_SQUEEZE", dslName: "squeezebbkc", label: "Squeeze (Bollinger inside Keltner)", paramLabels: ["Period", "Std Dev", "Keltner Mult"], defaults: [20, 2, 1.5] },
  { kind: "VWAP_UPPER_1", dslName: "vwapupper1", label: "VWAP +1 SD band", paramLabels: [], defaults: [] },
  { kind: "VWAP_LOWER_1", dslName: "vwaplower1", label: "VWAP -1 SD band", paramLabels: [], defaults: [] },
  { kind: "VWAP_UPPER_2", dslName: "vwapupper2", label: "VWAP +2 SD band", paramLabels: [], defaults: [] },
  { kind: "VWAP_LOWER_2", dslName: "vwaplower2", label: "VWAP -2 SD band", paramLabels: [], defaults: [] },
  { kind: "RSI_CHANGE", dslName: "rsichange", label: "RSI change over N bars", paramLabels: ["Period", "Bars"], defaults: [14, 3] },
  { kind: "MACD_HIST_CHANGE", dslName: "macdhistogramchange", label: "MACD histogram change over N bars", paramLabels: ["Fast", "Slow", "Signal", "Bars"], defaults: [12, 26, 9, 1] },
  { kind: "BB_MIDDLE_CHANGE", dslName: "bollingermiddlechange", label: "Bollinger middle band change over N bars", paramLabels: ["Period", "Bars"], defaults: [20, 3] },
  // Fibonacci levels from the latest confirmed swing (lib/indicators-study.ts): Left/Right = bars either side that confirm a swing,
  // Min swing ATR = ignore swings smaller than that many ATRs.
  { kind: "FIB_RET_382", dslName: "fibretracement382", label: "Fibonacci 38.2% retracement", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_RET_500", dslName: "fibretracement500", label: "Fibonacci 50% retracement", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_RET_618", dslName: "fibretracement618", label: "Fibonacci 61.8% retracement", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_RET_786", dslName: "fibretracement786", label: "Fibonacci 78.6% retracement", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_EXT_1272", dslName: "fibextension1272", label: "Fibonacci 1.272 extension", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_EXT_1618", dslName: "fibextension1618", label: "Fibonacci 1.618 extension", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_GOLDEN_ZONE", dslName: "fibgoldenzone", label: "In Fibonacci golden zone (1 = yes)", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_DIRECTION", dslName: "fibdirection", label: "Fibonacci swing direction (1 up, -1 down)", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  // From the analyst studies: divergence flags (1 on the candle the divergence is confirmed, `Right` candles after the second swing),
  // PPO, Bollinger W-bottom / M-top, anchored VWAPs and extra Fibonacci tools.
  { kind: "RSI_BULL_DIVERGENCE", dslName: "rsibulldivergence", label: "RSI bullish divergence", paramLabels: ["Period", "Left", "Right", "Max bars"], defaults: [14, 5, 5, 60] },
  { kind: "RSI_BEAR_DIVERGENCE", dslName: "rsibeardivergence", label: "RSI bearish divergence", paramLabels: ["Period", "Left", "Right", "Max bars"], defaults: [14, 5, 5, 60] },
  { kind: "MACD_BULL_DIVERGENCE", dslName: "macdbulldivergence", label: "MACD bullish divergence", paramLabels: ["Fast", "Slow", "Signal", "Left", "Right", "Max bars"], defaults: [12, 26, 9, 5, 5, 60] },
  { kind: "MACD_BEAR_DIVERGENCE", dslName: "macdbeardivergence", label: "MACD bearish divergence", paramLabels: ["Fast", "Slow", "Signal", "Left", "Right", "Max bars"], defaults: [12, 26, 9, 5, 5, 60] },
  { kind: "PPO_LINE", dslName: "ppoline", label: "PPO line (MACD as % of price)", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "PPO_SIGNAL", dslName: "pposignal", label: "PPO signal", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "PPO_HISTOGRAM", dslName: "ppohistogram", label: "PPO histogram", paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  { kind: "BB_W_BOTTOM", dslName: "bollingerwbottom", label: "Bollinger W-bottom", paramLabels: ["Period", "Std Dev", "Left", "Right", "Max bars"], defaults: [20, 2, 5, 5, 60] },
  { kind: "BB_M_TOP", dslName: "bollingermtop", label: "Bollinger M-top", paramLabels: ["Period", "Std Dev", "Left", "Right", "Max bars"], defaults: [20, 2, 5, 5, 60] },
  { kind: "VWAP_WEEK", dslName: "vwapweek", label: "Weekly VWAP", paramLabels: [], defaults: [] },
  { kind: "VWAP_MONTH", dslName: "vwapmonth", label: "Monthly VWAP", paramLabels: [], defaults: [] },
  { kind: "VWAP_FROM_DATE", dslName: "vwapfromdate", label: "Anchored VWAP from a date", paramLabels: ["Anchor date (YYYYMMDD)"], defaults: [20260101], maxes: { 0: 99991231 } },
  { kind: "VWAP_SWING_LOW", dslName: "vwapfromswinglow", label: "Anchored VWAP from the latest swing low", paramLabels: ["Left", "Right"], defaults: [5, 5] },
  { kind: "VWAP_SWING_HIGH", dslName: "vwapfromswinghigh", label: "Anchored VWAP from the latest swing high", paramLabels: ["Left", "Right"], defaults: [5, 5] },
  { kind: "FIB_CONFLUENCE", dslName: "fibconfluence", label: "Fibonacci cluster (levels of 2+ swings together)", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_SETUP_AGE", dslName: "fibsetupage", label: "Fibonacci swing age (candles)", paramLabels: ["Left", "Right", "Min swing ATR"], defaults: [5, 5, 3] },
  { kind: "FIB_MANUAL_RET_382", dslName: "fibmanual382", label: "Fibonacci 38.2% (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_RET_500", dslName: "fibmanual500", label: "Fibonacci 50% (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_RET_618", dslName: "fibmanual618", label: "Fibonacci 61.8% (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_RET_786", dslName: "fibmanual786", label: "Fibonacci 78.6% (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_EXT_1272", dslName: "fibmanualext1272", label: "Fibonacci 1.272 extension (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_EXT_1618", dslName: "fibmanualext1618", label: "Fibonacci 1.618 extension (swing you enter)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
  { kind: "FIB_MANUAL_GOLDEN_ZONE", dslName: "fibmanualgoldenzone", label: "In golden zone of the swing you enter (1 = yes)", paramLabels: ["Swing start price", "Swing end price"], defaults: [100, 200], maxes: { 0: MAX_PRICE_PARAM, 1: MAX_PRICE_PARAM } },
];

export const INDICATOR_BY_KIND: Map<IndicatorKind, IndicatorDef> = new Map(
  INDICATOR_CATALOG.map((d) => [d.kind, d]),
);
export const INDICATOR_BY_DSL_NAME: Map<string, IndicatorDef> = new Map(
  INDICATOR_CATALOG.map((d) => [d.dslName, d]),
);

/** Indicators on their own scale — a bounded oscillator (0-100, +/-100, ...),
 * an unbounded momentum/volume measure, or a raw volatility *magnitude*
 * (ATR, StdDev: typically a few percent of price, never a price level
 * itself) — rather than the instrument's own price scale. None of these
 * make sense drawn as an overlay line on a candlestick chart (a volatility
 * magnitude of ~80 is an invisible flat line against a price axis in the
 * thousands), and none are meaningfully comparable to *price*, or to an
 * oscillator from a different family — only to a fixed threshold, or to
 * another member of the same `OSCILLATOR_SCALE_GROUP` (below). Confirmed
 * live for ATR/StdDev specifically: close never once dips below either
 * across a full year of real NSE data, so "close crossesAbove atr(14)" can
 * never fire — not a bug in atr()'s math (independently verified in Phase
 * B), but this exact category of scale mismatch. */
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
  "ATR",
  "STDDEV",
  // Scale-free ratios, 0/1 flags and "change over N bars" values: compared with fixed numbers, never with price.
  "BB_PERCENT_B",
  "BB_BANDWIDTH",
  "BB_SQUEEZE",
  "BB_KC_SQUEEZE",
  "RSI_CHANGE",
  "MACD_HIST_CHANGE",
  "BB_MIDDLE_CHANGE",
  "FIB_GOLDEN_ZONE",
  "FIB_DIRECTION",
  "RSI_BULL_DIVERGENCE",
  "RSI_BEAR_DIVERGENCE",
  "MACD_BULL_DIVERGENCE",
  "MACD_BEAR_DIVERGENCE",
  "PPO_LINE",
  "PPO_SIGNAL",
  "PPO_HISTOGRAM",
  "BB_W_BOTTOM",
  "BB_M_TOP",
  "FIB_CONFLUENCE",
  "FIB_SETUP_AGE",
  "FIB_MANUAL_GOLDEN_ZONE",
]);

/** A handful of oscillators are actually *paired* by construction — both
 * sides come from the same computation and share the same real scale, so
 * comparing them to each other is not just valid but is the single most
 * standard signal each one is known for: MACD Line crossing its own Signal
 * line, Stochastic %K crossing %D, +DI crossing -DI, Aroon Up crossing
 * Aroon Down. An earlier version of the oscillator-scale restriction
 * treated every oscillator as threshold-only with no exceptions, which
 * would have made these four classic strategies impossible to build in the
 * visual builder — caught live while trying to build a MACD Line vs MACD
 * Signal crossover strategy for a real backtest and finding MACD wasn't
 * even offered as an option. Every other oscillator (RSI, CCI, ROC, OBV,
 * Williams %R, MFI, Awesome Oscillator, CMF, ADX, ATR, StdDev) has no
 * natural partner on the same scale and stays threshold-only. */
export const OSCILLATOR_SCALE_GROUP: Partial<Record<IndicatorKind, string>> = {
  MACD_LINE: "MACD",
  MACD_SIGNAL: "MACD",
  MACD_HISTOGRAM: "MACD",
  STOCH_K: "STOCH",
  STOCH_D: "STOCH",
  PLUS_DI: "DI",
  MINUS_DI: "DI",
  AROON_UP: "AROON",
  AROON_DOWN: "AROON",
  PPO_LINE: "PPO",
  PPO_SIGNAL: "PPO",
  PPO_HISTOGRAM: "PPO",
};

/** True when two operands can meaningfully appear on either side of a
 * comparison: a constant is compatible with anything (it's the threshold
 * every oscillator needs); two price-scale operands (price fields,
 * non-oscillator indicators) are freely compatible as before; two
 * oscillators are compatible only when they share an
 * `OSCILLATOR_SCALE_GROUP` entry; an oscillator and a price-scale operand
 * are never compatible. Shared by the visual builder's operand-picker
 * restriction and the server-side feasibility check so both apply the
 * exact same rule. */
export function operandsScaleCompatible(a: Operand, b: Operand): boolean {
  if (a.kind === "constant" || b.kind === "constant") return true;
  const aOscillator = a.kind === "indicator" && OSCILLATOR_KINDS.has(a.type);
  const bOscillator = b.kind === "indicator" && OSCILLATOR_KINDS.has(b.type);
  if (aOscillator && bOscillator) {
    const groupA = a.kind === "indicator" ? OSCILLATOR_SCALE_GROUP[a.type] : undefined;
    const groupB = b.kind === "indicator" ? OSCILLATOR_SCALE_GROUP[b.type] : undefined;
    return groupA !== undefined && groupA === groupB;
  }
  return !aOscillator && !bOscillator;
}
