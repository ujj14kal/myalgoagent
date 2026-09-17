import { describe, it, expect } from "vitest";
import { sma, ema, wma, roc, obv, donchianChannels, pivotPoints, standardDeviation } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/**
 * Batch 1 of the full indicator verification pass (Phase B). Every expected
 * value below was hand-computed independently from each indicator's
 * standard, textbook definition — not derived by running the library's own
 * code and copying its output. Where a value repeats what the library also
 * produces, that is the verification; it is not assumed correct because
 * the library says so.
 */

function candle(time: number, open: number, high: number, low: number, close: number, volume = 0): Candle {
  return { time, open, high, low, close, volume };
}

// A simple, non-linear close sequence: 10, 20, 15, 25, 30.
const closes = [10, 20, 15, 25, 30];
const simpleCandles: Candle[] = closes.map((c, i) => candle(i, c, c, c, c));

describe("SMA — Simple Moving Average", () => {
  it("matches sum(period closes)/period at each valid bar", () => {
    // period=3: (10+20+15)/3=15, (20+15+25)/3=20/3*... = (20+15+25)/3=20,
    // (15+25+30)/3=70/3=23.3333...
    const result = sma(simpleCandles, 3);
    expect(result.map((p) => p.value)).toEqual([
      (10 + 20 + 15) / 3,
      (20 + 15 + 25) / 3,
      (15 + 25 + 30) / 3,
    ]);
    expect(result.map((p) => p.time)).toEqual([2, 3, 4]);
  });

  it("produces no points when there isn't a full period of data", () => {
    expect(sma(simpleCandles.slice(0, 2), 3)).toEqual([]);
  });
});

describe("EMA — Exponential Moving Average (SMA-seeded)", () => {
  it("seeds with the SMA of the first `period` closes, then applies k=2/(period+1)", () => {
    // period=3: seed = SMA(10,20,15) = 15 at index 2.
    // k = 2/4 = 0.5.
    // index 3: 25*0.5 + 15*0.5 = 20.
    // index 4: 30*0.5 + 20*0.5 = 25.
    const result = ema(simpleCandles, 3);
    expect(result.map((p) => p.value)).toEqual([15, 20, 25]);
    expect(result.map((p) => p.time)).toEqual([2, 3, 4]);
  });
});

describe("WMA — Weighted Moving Average", () => {
  it("weights the most recent bar highest, denom = period*(period+1)/2", () => {
    // period=3, denom=6.
    // index 2: (10*1+20*2+15*3)/6 = 95/6
    // index 3: (20*1+15*2+25*3)/6 = 125/6
    // index 4: (15*1+25*2+30*3)/6 = 155/6
    const result = wma(simpleCandles, 3);
    expect(result[0].value).toBeCloseTo(95 / 6, 10);
    expect(result[1].value).toBeCloseTo(125 / 6, 10);
    expect(result[2].value).toBeCloseTo(155 / 6, 10);
  });
});

describe("ROC — Rate of Change", () => {
  it("computes (close[i] - close[i-period]) / close[i-period] * 100", () => {
    // period=2: i=2: (15-10)/10*100=50; i=3: (25-20)/20*100=25; i=4: (30-15)/15*100=100
    const result = roc(simpleCandles, 2);
    expect(result.map((p) => p.value)).toEqual([50, 25, 100]);
  });
});

describe("OBV — On-Balance Volume", () => {
  it("adds volume on an up close, subtracts on a down close, holds flat on an equal close", () => {
    const candles: Candle[] = [
      candle(0, 10, 10, 10, 10, 100),
      candle(1, 20, 20, 20, 20, 200), // up: +200 -> 200
      candle(2, 15, 15, 15, 15, 150), // down: -150 -> 50
      candle(3, 15, 15, 15, 15, 120), // equal: unchanged -> 50
      candle(4, 25, 25, 25, 25, 300), // up: +300 -> 350
    ];
    const result = obv(candles);
    expect(result.map((p) => p.value)).toEqual([0, 200, 50, 50, 350]);
  });
});

describe("Donchian Channels", () => {
  it("upper = highest high, lower = lowest low over the `period` bars PRECEDING the current one (excludes it)", () => {
    const highs = [5, 8, 6, 9, 7];
    const lows = [1, 3, 2, 4, 3];
    const candles: Candle[] = highs.map((h, i) => candle(i, h, h, lows[i], h));
    const { upper, lower } = donchianChannels(candles, 3);
    // Window excludes the current bar — i=3 uses bars [0,1,2], i=4 uses [1,2,3].
    // (A window that included the current bar would make "close crosses
    // above the upper channel" mathematically impossible, since a bar's
    // own high is always part of its own rolling max — confirmed live
    // against real NSE data before this fix, zero entries every time.)
    // i=3: highs[5,8,6]->8, lows[1,3,2]->1
    // i=4: highs[8,6,9]->9, lows[3,2,4]->2
    expect(upper.map((p) => p.value)).toEqual([8, 9]);
    expect(lower.map((p) => p.value)).toEqual([1, 2]);
    expect(upper.map((p) => p.time)).toEqual([3, 4]);
  });
});

describe("Pivot Points — standard floor pivots from the PRIOR bar's H/L/C", () => {
  it("computes PP/R1-3/S1-3 from bar i-1, applied to bar i", () => {
    const candles: Candle[] = [
      candle(0, 9, 10, 8, 9), // prior bar: H=10 L=8 C=9
      candle(1, 9, 9, 9, 9), // this bar's own OHLC is irrelevant to its own pivot
    ];
    const { pp, r1, r2, r3, s1, s2, s3 } = pivotPoints(candles);
    // P = (10+8+9)/3 = 9
    expect(pp[0].value).toBeCloseTo(9);
    expect(r1[0].value).toBeCloseTo(2 * 9 - 8); // 10
    expect(s1[0].value).toBeCloseTo(2 * 9 - 10); // 8
    expect(r2[0].value).toBeCloseTo(9 + (10 - 8)); // 11
    expect(s2[0].value).toBeCloseTo(9 - (10 - 8)); // 7
    expect(r3[0].value).toBeCloseTo(10 + 2 * (9 - 8)); // 12
    expect(s3[0].value).toBeCloseTo(8 - 2 * (10 - 9)); // 6
  });
});

describe("Standard Deviation of closing price", () => {
  it("computes the population standard deviation over the period window", () => {
    const candles: Candle[] = [10, 20, 15].map((c, i) => candle(i, c, c, c, c));
    // mean = 15; variance = ((10-15)^2+(20-15)^2+(15-15)^2)/3 = 50/3
    const expected = Math.sqrt(50 / 3);
    const result = standardDeviation(candles, 3);
    expect(result[0].value).toBeCloseTo(expected, 10);
  });
});
