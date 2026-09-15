import type { Candle, CandleInterval } from "@/lib/market-data";
import { intervalDurationSeconds } from "@/lib/market-data";

/**
 * Aligns an "override" series (computed on a different candle interval than
 * the strategy's own base chart — could be coarser, like a daily indicator
 * referenced from an hourly chart, or finer, like a 5-minute candle-pattern
 * condition referenced from a daily chart) onto the base timeframe's bars.
 *
 * For each base bar, uses the most recent override bar that had *fully
 * closed* by the time the NEXT base bar opens — i.e. everything knowable by
 * the time this base bar's own period is over, and nothing from beyond it.
 * The cutoff is deliberately the next base bar's open time rather than this
 * base bar's own open time: using this bar's open time would be safe (no
 * look-ahead) for a coarser override, since a still-forming higher-timeframe
 * bar is correctly excluded, but it silently starves a *finer* override —
 * same-interval bars occurring during this base bar's own session (e.g. a
 * 5-minute bar timestamped mid-day) would never satisfy "closed before this
 * base bar even opened," permanently lagging the signal by roughly a full
 * base period. The last base bar (no known "next" one) has no upper bound —
 * every override bar fetched so far is fair game, matching a live session
 * still in progress.
 */
export function alignToBase<T>(
  baseCandles: Candle[],
  higherCandles: Candle[],
  higherInterval: CandleInterval,
  higherSeries: T[],
): (T | undefined)[] {
  const duration = intervalDurationSeconds(higherInterval);
  const out: (T | undefined)[] = new Array(baseCandles.length);

  let higherIdx = 0;
  let lastValue: T | undefined;

  for (let i = 0; i < baseCandles.length; i++) {
    const cutoff = baseCandles[i + 1]?.time ?? Infinity;
    while (higherIdx < higherCandles.length && higherCandles[higherIdx].time + duration <= cutoff) {
      lastValue = higherSeries[higherIdx];
      higherIdx++;
    }
    out[i] = lastValue;
  }

  return out;
}

/**
 * Same cross-timeframe alignment as `alignToBase`, but for boolean *pattern
 * signals* rather than numeric series. "Most recently known value" is the
 * right semantic for a number (an RSI reading stays valid until a newer one
 * closes), but wrong for a pattern: a Hammer that fires on exactly one
 * 5-minute bar and is false on every bar after it would almost never
 * survive to be "the last value" by the time a daily base bar closes, even
 * though the pattern genuinely occurred that day. When the override is
 * finer than the base (more than one override bar closes within a single
 * base bar's period), this instead OR-reduces every override bar belonging
 * to that period — true if the signal fired on *any* of them. When the
 * override is coarser or the same granularity, it falls back to
 * `alignToBase`'s carry-forward behavior, since there's nothing to reduce
 * over (at most one override bar closes per base period).
 */
export function alignSignalToBase(
  baseCandles: Candle[],
  overrideCandles: Candle[],
  overrideInterval: CandleInterval,
  overrideSeries: (boolean | undefined)[],
): (boolean | undefined)[] {
  const overrideDuration = intervalDurationSeconds(overrideInterval);
  const baseSpacing = baseCandles.length >= 2 ? baseCandles[1].time - baseCandles[0].time : Infinity;
  if (overrideDuration >= baseSpacing) {
    return alignToBase(baseCandles, overrideCandles, overrideInterval, overrideSeries);
  }

  const out: (boolean | undefined)[] = new Array(baseCandles.length);
  let idx = 0;

  for (let i = 0; i < baseCandles.length; i++) {
    const cutoff = baseCandles[i + 1]?.time ?? Infinity;
    let sawAny = false;
    let anyTrue = false;
    while (idx < overrideCandles.length && overrideCandles[idx].time + overrideDuration <= cutoff) {
      sawAny = true;
      if (overrideSeries[idx]) anyTrue = true;
      idx++;
    }
    out[i] = sawAny ? anyTrue : undefined;
  }

  return out;
}
