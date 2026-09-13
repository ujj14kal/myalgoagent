import type { Candle } from "@/lib/market-data";
import { obv } from "@/lib/indicators";
import { findSwingPoints } from "@/lib/chart-patterns";

export type VolumePatternKind =
  | "VOLUME_SPIKE"
  | "VOLUME_DRY_UP"
  | "BULLISH_VOLUME_BREAKOUT"
  | "BEARISH_VOLUME_BREAKDOWN"
  | "OBV_BULLISH_DIVERGENCE"
  | "OBV_BEARISH_DIVERGENCE";

// Tunable thresholds — a single spot to retune without touching detector logic.
const LOOKBACK = 20; // bars used to compute "average" volume and the recent high/low
const SPIKE_MULTIPLIER = 2; // volume >= 2x its recent average counts as a spike
const DRY_UP_MULTIPLIER = 0.5; // volume <= 0.5x its recent average counts as a dry-up
const DIVERGENCE_SWING_LOOKBACK = 3; // bars on each side a swing high/low must beat, to confirm it (matches chart-patterns' default)
const DIVERGENCE_MIN_SWING_PCT = 0.01; // a swing must move at least 1% to count (filters noise)

function averageVolume(candles: Candle[], i: number, lookback: number): number | undefined {
  if (i < lookback) return undefined;
  let sum = 0;
  for (let j = i - lookback; j < i; j++) sum += candles[j].volume;
  return sum / lookback;
}

function isVolumeSpike(candles: Candle[], i: number): boolean {
  const avg = averageVolume(candles, i, LOOKBACK);
  return avg !== undefined && avg > 0 && candles[i].volume >= SPIKE_MULTIPLIER * avg;
}

function isVolumeDryUp(candles: Candle[], i: number): boolean {
  const avg = averageVolume(candles, i, LOOKBACK);
  return avg !== undefined && avg > 0 && candles[i].volume <= DRY_UP_MULTIPLIER * avg;
}

function isBullishVolumeBreakout(candles: Candle[], i: number): boolean {
  if (i < LOOKBACK || !isVolumeSpike(candles, i)) return false;
  const recentHigh = Math.max(...candles.slice(i - LOOKBACK, i).map((c) => c.high));
  return candles[i].close > recentHigh;
}

function isBearishVolumeBreakdown(candles: Candle[], i: number): boolean {
  if (i < LOOKBACK || !isVolumeSpike(candles, i)) return false;
  const recentLow = Math.min(...candles.slice(i - LOOKBACK, i).map((c) => c.low));
  return candles[i].close < recentLow;
}

/**
 * Divergence between price and OBV: price and volume-flow disagreeing on
 * direction is a classic early-warning signal. Bullish divergence = price
 * makes a *lower* low while OBV makes a *higher* low (selling pressure is
 * drying up despite the falling price — accumulation). Bearish divergence
 * mirrors this on swing highs (rising price on weakening volume-flow —
 * distribution). Fires exactly once, on the bar the second swing point
 * first becomes confirmable (no look-ahead) — same convention as chart
 * patterns, which fire only on their confirming bar, not every bar after.
 */
function detectObvDivergence(candles: Candle[], i: number, bullish: boolean): boolean {
  const swingType = bullish ? "low" : "high";
  const swings = findSwingPoints(candles, DIVERGENCE_SWING_LOOKBACK, DIVERGENCE_MIN_SWING_PCT).filter(
    (s) => s.type === swingType && s.index <= i - DIVERGENCE_SWING_LOOKBACK,
  );
  if (swings.length < 2) return false;

  const second = swings[swings.length - 1];
  if (second.index + DIVERGENCE_SWING_LOOKBACK !== i) return false; // only fire once, when `second` first becomes known
  const first = swings[swings.length - 2];

  const obvSeries = obv(candles);
  const obvFirst = obvSeries[first.index]?.value;
  const obvSecond = obvSeries[second.index]?.value;
  if (obvFirst === undefined || obvSecond === undefined) return false;

  return bullish ? second.price < first.price && obvSecond > obvFirst : second.price > first.price && obvSecond < obvFirst;
}

function detectAt(candles: Candle[], i: number, pattern: VolumePatternKind): boolean {
  switch (pattern) {
    case "VOLUME_SPIKE":
      return isVolumeSpike(candles, i);
    case "VOLUME_DRY_UP":
      return isVolumeDryUp(candles, i);
    case "BULLISH_VOLUME_BREAKOUT":
      return isBullishVolumeBreakout(candles, i);
    case "BEARISH_VOLUME_BREAKDOWN":
      return isBearishVolumeBreakdown(candles, i);
    case "OBV_BULLISH_DIVERGENCE":
      return detectObvDivergence(candles, i, true);
    case "OBV_BEARISH_DIVERGENCE":
      return detectObvDivergence(candles, i, false);
  }
}

export function computeVolumePatternSeries(candles: Candle[], pattern: VolumePatternKind): boolean[] {
  return candles.map((_, i) => detectAt(candles, i, pattern));
}
