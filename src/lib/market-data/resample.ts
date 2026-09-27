import type { Candle } from "./types";

// Builds candles for timeframes the data source doesn't offer, from smaller
// ones — e.g. 3-minute candles from 1-minute, 4-hour from 1-hour. Buckets are
// aligned to the NSE session (09:15 IST), the way Indian charting platforms
// draw them, never to the clock hour.

const IST_OFFSET_SECONDS = 5.5 * 3600;
export const SESSION_OPEN_MINUTE = 9 * 60 + 15; // 09:15 IST

/** IST calendar day and minute-of-day for a candle's start time. */
export function istDayAndMinute(time: number): { day: number; minute: number } {
  const local = time + IST_OFFSET_SECONDS;
  return { day: Math.floor(local / 86400), minute: Math.floor((local % 86400) / 60) };
}

function istTime(day: number, minute: number): number {
  return day * 86400 + minute * 60 - IST_OFFSET_SECONDS;
}

/** Start minute of the N-minute bucket a minute falls in, counted from 09:15. */
export function fixedBucket(sizeMinutes: number) {
  return (minute: number) => SESSION_OPEN_MINUTE + Math.floor((minute - SESSION_OPEN_MINUTE) / sizeMinutes) * sizeMinutes;
}

/** NSE 4-hour candles: 09:15–13:15 and 13:15–15:30 (the second one is shorter). */
export function fourHourBucket(minute: number): number {
  return minute < 13 * 60 + 15 ? SESSION_OPEN_MINUTE : 13 * 60 + 15;
}

/**
 * Groups candles into buckets (same IST day, same bucket start): open of the
 * first, highest high, lowest low, close of the last, summed volume. Each
 * resulting candle is stamped with its bucket's start time.
 */
export function resampleCandles(candles: Candle[], bucketStart: (minuteOfDay: number) => number): Candle[] {
  const out: Candle[] = [];
  let key = "";
  for (const c of candles) {
    const { day, minute } = istDayAndMinute(c.time);
    const start = bucketStart(minute);
    const k = `${day}:${start}`;
    const last = out[out.length - 1];
    if (k === key && last) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      key = k;
      out.push({ time: istTime(day, start), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    }
  }
  return out;
}
