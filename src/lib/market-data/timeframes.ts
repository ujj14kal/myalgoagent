import type { CandleInterval, CandleRange } from "./types";

/**
 * Single source of truth for which (range, interval) combinations are
 * actually servable. These aren't arbitrary choices — they mirror Yahoo
 * Finance's own documented limits on its `v8/finance/chart` endpoint (the
 * same one TradingView's own charts respect for exchange data with similar
 * granularity restrictions): 1-minute bars are only kept for the last ~7
 * days, the 2m/5m/15m/30m intraday bars for ~60 days, and 60-minute bars for
 * ~2 years. Daily/weekly/monthly bars have no such limit. Requesting an
 * out-of-window combo doesn't error cleanly upstream — it silently returns
 * truncated or empty data — so this list lets the UI gray out combinations
 * before the request ever goes out, the way TradingView's own interval
 * picker does.
 */
export const RANGES: { value: CandleRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
  { value: "max", label: "All" },
];

export const INTERVALS: { value: CandleInterval; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "3m", label: "3m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "60m", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
  { value: "1wk", label: "1W" },
  { value: "1mo", label: "1M" },
];

// 3m is built from 1m candles and 4h from 60m ones, so they share those limits.
const INTRADAY_1M: CandleInterval[] = ["1m", "3m"];
const INTRADAY_SHORT: CandleInterval[] = ["2m", "5m", "15m", "30m"];
const INTRADAY_HOUR: CandleInterval[] = ["60m", "4h"];

/** True for any timeframe shorter than a day — where time-of-day rules and square-off apply. */
export function isIntraday(interval: CandleInterval): boolean {
  return INTRADAY_1M.includes(interval) || INTRADAY_SHORT.includes(interval) || INTRADAY_HOUR.includes(interval);
}

/**
 * How much history a source keeps: "standard" is Yahoo's window (above);
 * "extended" is the licensed feed (TrueData), which keeps years of intraday
 * candles — capped here only so a single chart/backtest stays quick to load.
 */
export type HistoryDepth = "standard" | "extended";

const RANGE_ORDER: CandleRange[] = ["1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "5y", "max"];

/** The widest range each interval can be served for at this depth. */
export function maxRangeForInterval(interval: CandleInterval, depth: HistoryDepth = "standard"): CandleRange {
  if (depth === "extended") {
    if (INTRADAY_1M.includes(interval)) return "3mo";
    if (INTRADAY_SHORT.includes(interval)) return "1y";
    if (INTRADAY_HOUR.includes(interval)) return "5y";
    return "max";
  }
  if (INTRADAY_1M.includes(interval)) return "5d";
  if (INTRADAY_SHORT.includes(interval)) return "1mo";
  if (INTRADAY_HOUR.includes(interval)) return "1y";
  return "max";
}

/** Whether a (range, interval) pair can be served at this depth. `ytd` counts as within anything from 1y up. */
export function isValidCombo(range: CandleRange, interval: CandleInterval, depth: HistoryDepth = "standard"): boolean {
  const max = maxRangeForInterval(interval, depth);
  if (max === "max") return true;
  const maxIdx = RANGE_ORDER.indexOf(max);
  if (range === "ytd") return maxIdx >= RANGE_ORDER.indexOf("1y");
  return RANGE_ORDER.indexOf(range) <= maxIdx;
}

/**
 * The interval TradingView-style charts default to for a given visible
 * range — e.g. picking "1D" defaults to minute bars, picking "5Y" defaults
 * to monthly bars, so the chart always opens with a readable candle count
 * instead of cramming a thousand daily bars into one view.
 */
export function defaultIntervalForRange(range: CandleRange): CandleInterval {
  switch (range) {
    case "1d":
      return "5m";
    case "5d":
      return "30m";
    case "1mo":
      return "60m";
    case "3mo":
    case "6mo":
      return "1d";
    case "ytd":
    case "1y":
      return "1d";
    case "5y":
      return "1wk";
    case "max":
      return "1mo";
  }
}

/** Clamps `range` down to the widest range `interval` can serve at this depth, leaving it unchanged when it's already within bounds. */
export function clampRangeForInterval(range: CandleRange, interval: CandleInterval, depth: HistoryDepth = "standard"): CandleRange {
  if (isValidCombo(range, interval, depth)) return range;
  return maxRangeForInterval(interval, depth);
}

export const VALID_RANGES: CandleRange[] = RANGES.map((r) => r.value);
export const VALID_INTERVALS: CandleInterval[] = [...INTERVALS.map((i) => i.value), "2m"];

/** How long one bar of this interval actually spans, in seconds — the basis
 * for multi-timeframe alignment: a higher-timeframe bar is only "closed"
 * (safe to reference from a lower-timeframe bar) once this much time has
 * passed since it opened. `1mo` is a 30-day approximation, fine for
 * alignment purposes since it only needs to be a safe lower bound. */
export function intervalDurationSeconds(interval: CandleInterval): number {
  switch (interval) {
    case "1m":
      return 60;
    case "2m":
      return 120;
    case "3m":
      return 180;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "60m":
      return 3600;
    case "4h":
      // The afternoon 4-hour candle is shorter (13:15–15:30); a full 4 hours is
      // the safe upper bound, so a 4H candle is never used before it has closed.
      return 4 * 3600;
    case "1d":
      return 86400;
    case "1wk":
      return 604800;
    case "1mo":
      return 30 * 86400;
  }
}
