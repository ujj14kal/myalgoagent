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
