import { describe, it, expect } from "vitest";
import { rsi, atr } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/**
 * Batch 2 (Phase B): Wilder-smoothed indicators. Wilder's smoothing method
 * (used identically for RSI, ATR, and ADX) seeds with a plain average of
 * the first `period` values, then recursively smooths every subsequent
 * value as (prevAvg * (period-1) + newValue) / period — distinct from a
 * standard EMA's k = 2/(period+1). Verified here by hand-tracing that
 * exact recursion across several steps, not by re-running the library's
 * own formula against itself.
 */

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close, volume: 0 };
}

describe("RSI — Wilder's Relative Strength Index", () => {
  it("hand-traces the Wilder recursion across 3 smoothing steps", () => {
    // closes: 10, 12, 11, 14, 13, 15 -> changes: +2, -1, +3, -1, +2
    const closes = [10, 12, 11, 14, 13, 15];
    const candles = closes.map((c, i) => candle(i, c, c, c, c));

    // Seed (period=3) from changes at i=1..3 (+2,-1,+3): gainSum=5, lossSum=1
    // avgGain=5/3, avgLoss=1/3 -> RS=5 -> RSI = 100 - 100/6 = 83.3333...
    // Step i=4 (change -1): avgGain=(5/3*2+0)/3=10/9, avgLoss=(1/3*2+1)/3=5/9
    //   RS=2 -> RSI = 100 - 100/3 = 66.6667
    // Step i=5 (change +2): avgGain=(10/9*2+2)/3=38/27, avgLoss=(5/9*2+0)/3=10/27
    //   RS=3.8 -> RSI = 100 - 100/4.8 = 79.1667
    const result = rsi(candles, 3);
    expect(result.map((p) => p.value)).toEqual(
      [100 - 100 / (1 + 5), 100 - 100 / (1 + 2), 100 - 100 / (1 + 3.8)].map((v) => expect.closeTo(v, 6)),
    );
  });

  it("returns 100 when there have been no losses at all in the smoothing window (avgLoss = 0)", () => {
    const closes = [10, 11, 12, 13];
    const candles = closes.map((c, i) => candle(i, c, c, c, c));
    const result = rsi(candles, 3);
    expect(result[0].value).toBe(100);
  });

  it("produces no points without at least period+1 candles", () => {
    const candles = [10, 11, 12].map((c, i) => candle(i, c, c, c, c));
    expect(rsi(candles, 3)).toEqual([]);
  });
});

describe("ATR — Wilder's Average True Range", () => {
  it("hand-traces true range + the Wilder recursion across 2 smoothing steps", () => {
    const candles: Candle[] = [
      candle(0, 9, 10, 8, 9),
      candle(1, 10.5, 11, 9, 10.5), // TR = max(11-9, |11-9|, |9-9|) = 2
      candle(2, 8, 9, 7, 8), // TR = max(9-7, |9-10.5|, |7-10.5|) = 3.5
      candle(3, 11, 12, 9, 11), // TR = max(12-9, |12-8|, |9-8|) = 4
      candle(4, 12, 13, 11, 12), // TR = max(13-11, |13-11|, |11-11|) = 2
      candle(5, 13, 14, 10, 13), // TR = max(14-10, |14-12|, |10-12|) = 4
    ];
    // Seed (period=3): (2 + 3.5 + 4) / 3 = 3.1666...7 at index 3
    // Step i=4: (3.1667*2 + 2) / 3 = 2.7778
    // Step i=5: (2.7778*2 + 4) / 3 = 3.1852
    const result = atr(candles, 3);
    expect(result[0].value).toBeCloseTo((2 + 3.5 + 4) / 3, 6);
    expect(result[1].value).toBeCloseTo(2.777777778, 6);
    expect(result[2].value).toBeCloseTo(3.185185185, 6);
    expect(result.map((p) => p.time)).toEqual([3, 4, 5]);
  });
});
