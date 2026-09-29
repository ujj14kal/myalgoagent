import type { CandleInterval } from "@/lib/market-data";
import { bucketStart } from "@/lib/market-data/live-candle";

// Webhook strategies follow the user's own TradingView alerts — not manual
// buy/sell clicks. So a signal must come from TradingView's servers, and a
// strategy acts on at most one signal per candle of its timeframe.

/** The only addresses TradingView sends webhook alerts from (tradingview.com/support/solutions/43000529348). */
export const TRADINGVIEW_IPS = new Set(["52.89.214.238", "34.212.75.30", "54.218.53.128", "52.32.178.7"]);

export function isTradingViewIp(ip: string): boolean {
  return TRADINGVIEW_IPS.has(ip.trim());
}

/** Whether two moments fall in the same candle of the strategy's timeframe (daily and longer: the same IST day). */
export function sameCandle(a: Date, b: Date, timeframe: string): boolean {
  const tf = (["1m", "3m", "5m", "15m", "30m", "60m", "4h"].includes(timeframe) ? timeframe : "1d") as CandleInterval;
  const ka = bucketStart(Math.floor(a.getTime() / 1000), tf);
  const kb = bucketStart(Math.floor(b.getTime() / 1000), tf);
  if (ka === null || kb === null) {
    // Outside market hours intraday buckets don't exist — fall back to the same IST day.
    const day = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    return day(a) === day(b);
  }
  return ka === kb;
}
