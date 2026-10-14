import { describe, expect, it } from "vitest";
import { parseCryptoMarkets } from "./crypto-universe";
import { bucketCandles, coindcxPair, isCryptoSymbol } from "@/lib/market-data/crypto";

describe("crypto instruments", () => {
  it("keeps active INR markets and names them BASE-INR", () => {
    const rows = parseCryptoMarkets([
      { base_currency_short_name: "INR", target_currency_short_name: "BTC", target_currency_name: "Bitcoin", status: "active" },
      { base_currency_short_name: "USDT", target_currency_short_name: "BTC", target_currency_name: "Bitcoin", status: "active" },
      { base_currency_short_name: "INR", target_currency_short_name: "OLD", target_currency_name: "Old", status: "delisted" },
      { base_currency_short_name: "INR", target_currency_short_name: "btc", target_currency_name: "Bitcoin again", status: "active" },
      { base_currency_short_name: "INR", target_currency_short_name: "bad coin!", status: "active" },
    ]);
    expect(rows).toEqual([{ symbol: "BTC-INR", name: "Bitcoin (BTC)", exchange: "CRYPTO", sector: "Crypto" }]);
  });
  it("tells crypto pairs from stocks", () => {
    expect(isCryptoSymbol("BTC-INR")).toBe(true);
    expect(isCryptoSymbol("RELIANCE.NS")).toBe(false);
    expect(isCryptoSymbol("BAJAJ-AUTO.NS")).toBe(false);
    expect(coindcxPair("eth-inr")).toBe("I-ETH_INR");
  });
  it("copes with junk", () => expect(parseCryptoMarkets({})).toEqual([]));
});

describe("crypto candle buckets", () => {
  const c = (time: number, o: number, h: number, l: number, cl: number, v = 1) => ({ time, open: o, high: h, low: l, close: cl, volume: v });
  it("five 1-minute candles become one 5-minute candle", () => {
    const base = 1_800_000_000 - (1_800_000_000 % 300);
    const rows = [c(base, 10, 12, 9, 11), c(base + 60, 11, 15, 10, 14), c(base + 120, 14, 14, 8, 9), c(base + 180, 9, 10, 9, 10), c(base + 240, 10, 11, 9, 10.5), c(base + 300, 10.5, 11, 10, 11)];
    const out = bucketCandles(rows, (t) => Math.floor(t / 300) * 300);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: base, open: 10, high: 15, low: 8, close: 10.5, volume: 5 });
    expect(out[1].time).toBe(base + 300);
  });
});
