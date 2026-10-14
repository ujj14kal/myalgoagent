import type { Candle } from "./types";

// Crypto instruments trade against the rupee and are named like CoinDCX lists them: BTC-INR, ETH-INR, SOL-INR.
// No NSE or BSE symbol ends in -INR, so the name alone says which source and which rules apply.

const CRYPTO_SYMBOL = /^[A-Z0-9]{2,12}-INR$/;

export function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SYMBOL.test(symbol.toUpperCase());
}

/** CoinDCX's own name for a pair: BTC-INR → I-BTC_INR (the "I" is the INR market). */
export function coindcxPair(symbol: string): string {
  return `I-${symbol.toUpperCase().replace("-", "_")}`;
}

/** The coin's own name part: BTC-INR → BTC. */
export function cryptoBase(symbol: string): string {
  return symbol.toUpperCase().replace(/-INR$/, "");
}

/** Crypto trades around the clock, every day: no session, no holidays. */
export const CRYPTO_ALWAYS_OPEN = true;

/** Candles grouped into buckets: open of the first, highest high, lowest low, close of the last, summed volume. */
export function bucketCandles(candles: Candle[], bucket: (t: number) => number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const start = bucket(c.time);
    const last = out[out.length - 1];
    if (last && last.time === start) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else out.push({ ...c, time: start });
  }
  return out;
}

