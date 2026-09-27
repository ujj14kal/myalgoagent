import type { Candle } from "@/lib/market-data";

// Indian exchange sessions (NSE/BSE equity + derivatives) run entirely within
// a single IST day (max ~09:00-23:30 for commodities), so a plain
// non-wrapping [start, end) range is sufficient — no need to handle a window
// that wraps past midnight.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function istMinuteOfDay(unixSeconds: number): number {
  const utcMinutes = Math.floor(unixSeconds / 60);
  return (utcMinutes + IST_OFFSET_MINUTES) % (24 * 60);
}

/** True for every bar whose IST time-of-day falls within [startMinute, endMinute). */
export function computeTimeWindowSeries(candles: Candle[], startMinute: number, endMinute: number): boolean[] {
  return candles.map((c) => {
    const minute = istMinuteOfDay(c.time);
    return minute >= startMinute && minute < endMinute;
  });
}

/**
 * Time rules in a strategy describe *when the order happens*. The engine acts
 * on a signal at the next candle's open, so a time window is true on a candle
 * when the next candle (the fill) starts inside it — "enter between 09:15 and
 * 09:30" fills at 09:15, "exit at 15:15" closes at 15:15. Only the clock is
 * used (candle start times follow the exchange schedule), never future prices.
 * For the latest candle the next start is estimated from the candle spacing.
 */
export function computeOrderTimeWindowSeries(candles: Candle[], startMinute: number, endMinute: number): boolean[] {
  return candles.map((c, i) => {
    const next = candles[i + 1]?.time ?? c.time + (i > 0 ? c.time - candles[i - 1].time : 60);
    const minute = istMinuteOfDay(next);
    return minute >= startMinute && minute < endMinute;
  });
}
