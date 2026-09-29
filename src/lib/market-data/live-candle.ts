import type { Candle, CandleInterval, Tick } from "./types";
import { fixedBucket, fourHourBucket, istDayAndMinute, SESSION_OPEN_MINUTE } from "./resample";

// Folds live trades into the candle that's forming right now, on the chart's
// own timeframe (buckets aligned to the 09:15 IST open, like the history).

const IST_OFFSET_SECONDS = 5.5 * 3600;
const MINUTES: Partial<Record<CandleInterval, number>> = { "1m": 1, "2m": 2, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "60m": 60 };

/** Start time of the candle a trade at `time` belongs to, or null for timeframes live updates don't cover (weekly/monthly). */
export function bucketStart(time: number, interval: CandleInterval): number | null {
  const { day, minute } = istDayAndMinute(time);
  const at = (m: number) => day * 86400 + m * 60 - IST_OFFSET_SECONDS;
  if (interval === "1d") return at(SESSION_OPEN_MINUTE);
  if (interval === "4h") return at(fourHourBucket(minute));
  const size = MINUTES[interval];
  if (!size) return null;
  if (minute < SESSION_OPEN_MINUTE) return null;
  return at(fixedBucket(size)(minute));
}

/**
 * Applies ticks (oldest first) to `current` — the candle being formed, or the
 * last history candle. Returns the candles that finished along the way and the
 * one now forming. A tick in the same bucket extends it; a later one starts a new candle.
 */
export function applyTicks(current: Candle | null, ticks: Tick[], interval: CandleInterval): { closed: Candle[]; forming: Candle | null } {
  const closed: Candle[] = [];
  let forming = current ? { ...current } : null;
  for (const t of ticks) {
    const start = bucketStart(t.time, interval);
    if (start == null) continue;
    if (forming && start < forming.time) continue; // late tick for a finished candle
    if (!forming || start > forming.time) {
      if (forming) closed.push(forming);
      forming = { time: start, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.volume };
      continue;
    }
    forming.high = Math.max(forming.high, t.price);
    forming.low = Math.min(forming.low, t.price);
    forming.close = t.price;
    forming.volume += t.volume;
  }
  return { closed, forming };
}
