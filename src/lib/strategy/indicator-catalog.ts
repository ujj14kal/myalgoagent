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
