import type { Candle, CandleInterval } from "@/lib/market-data";
import { intervalDurationSeconds } from "@/lib/market-data";

/**
 * Carries a higher-timeframe series down onto a base timeframe's bars,
 * using only bars that had *fully closed* by each base bar's time — a
 * still-forming higher-timeframe bar is never used, which is what makes
 * this safe from look-ahead. For each base bar, finds the most recent
 * higher-timeframe bar whose close time (`time + duration`) is at or before
 * the base bar's time, and carries its value forward until a newer closed
 * bar supersedes it.
 */
export function alignToBase(
  baseCandles: Candle[],
  higherCandles: Candle[],
  higherInterval: CandleInterval,
  higherSeries: (number | undefined)[],
): (number | undefined)[] {
  const duration = intervalDurationSeconds(higherInterval);
  const out: (number | undefined)[] = new Array(baseCandles.length);

  let higherIdx = 0;
  let lastValue: number | undefined;

  for (let i = 0; i < baseCandles.length; i++) {
    const baseTime = baseCandles[i].time;
    while (higherIdx < higherCandles.length && higherCandles[higherIdx].time + duration <= baseTime) {
      lastValue = higherSeries[higherIdx];
      higherIdx++;
    }
    out[i] = lastValue;
  }

  return out;
}
