import type { Candle } from "@/lib/market-data";

export type VolumePatternKind = "VOLUME_SPIKE" | "VOLUME_DRY_UP" | "BULLISH_VOLUME_BREAKOUT" | "BEARISH_VOLUME_BREAKDOWN";

// Tunable thresholds — a single spot to retune without touching detector logic.
const LOOKBACK = 20; // bars used to compute "average" volume and the recent high/low
const SPIKE_MULTIPLIER = 2; // volume >= 2x its recent average counts as a spike
const DRY_UP_MULTIPLIER = 0.5; // volume <= 0.5x its recent average counts as a dry-up

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
  }
}

export function computeVolumePatternSeries(candles: Candle[], pattern: VolumePatternKind): boolean[] {
  return candles.map((_, i) => detectAt(candles, i, pattern));
}
