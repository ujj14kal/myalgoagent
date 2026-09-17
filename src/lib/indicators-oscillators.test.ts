import { describe, it, expect } from "vitest";
import { stochastic, cci, williamsR } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/** Batch 3 (Phase B): range/oscillator indicators. Each expected value is
 * hand-computed from the indicator's standard definition. */

function candle(time: number, high: number, low: number, close: number): Candle {
  return { time, open: close, high, low, close, volume: 0 };
}

describe("Stochastic Oscillator", () => {
  it("%K = 100*(close-lowest)/(highest-lowest) over kPeriod; %D = SMA(%K, dPeriod)", () => {
    const highs = [10, 12, 9, 14, 11];
    const lows = [8, 9, 7, 10, 9];
    const closes = [9, 11, 8, 13, 10];
    const candles = highs.map((h, i) => candle(i, h, lows[i], closes[i]));

    // kPeriod=3:
    // i=2: highest(10,12,9)=12, lowest(8,9,7)=7, close=8 -> 100*(8-7)/(12-7)=20
    // i=3: highest(12,9,14)=14, lowest(9,7,10)=7, close=13 -> 100*(13-7)/(14-7)=600/7
    // i=4: highest(9,14,11)=14, lowest(7,10,9)=7, close=10 -> 100*(10-7)/(14-7)=300/7
    const { k, d } = stochastic(candles, 3, 2);
    expect(k[0].value).toBeCloseTo(20, 10);
    expect(k[1].value).toBeCloseTo(600 / 7, 10);
    expect(k[2].value).toBeCloseTo(300 / 7, 10);

    // dPeriod=2: d[0] = avg(k[0],k[1]); d[1] = avg(k[1],k[2])
    expect(d[0].value).toBeCloseTo((20 + 600 / 7) / 2, 10);
    expect(d[1].value).toBeCloseTo((600 / 7 + 300 / 7) / 2, 10);
  });

  it("returns the midpoint (50) when the period's range is zero (highest == lowest)", () => {
    const flat = [10, 10, 10].map((v, i) => candle(i, v, v, v));
    const { k } = stochastic(flat, 3, 1);
    expect(k[0].value).toBe(50);
  });
});

describe("CCI — Commodity Channel Index", () => {
  it("matches (typicalPrice - meanTP) / (0.015 * meanDeviation)", () => {
    // H/L/C per bar; typical price = (H+L+C)/3
    const candles = [
      candle(0, 10, 8, 9), // TP = 9
      candle(1, 12, 9, 11), // TP = 32/3
      candle(2, 11, 9, 10), // TP = 10
    ];
    // meanTP = (9 + 32/3 + 10)/3 = 89/9
    // meanDeviation = (|9-89/9| + |32/3-89/9| + |10-89/9|)/3 = (8/9+7/9+1/9)/3 = 16/27
    // CCI = (10 - 89/9) / (0.015 * 16/27) = (1/9) / (0.0088888...) = 12.5
    const result = cci(candles, 3);
    expect(result[0].value).toBeCloseTo(12.5, 6);
  });
});

describe("Williams %R", () => {
  it("matches -100 * (highest - close) / (highest - lowest)", () => {
    const candles = [candle(0, 10, 8, 9), candle(1, 12, 9, 11), candle(2, 9, 7, 8)];
    // highest=12, lowest=7, close(last)=8 -> -100*(12-8)/(12-7) = -80
    const result = williamsR(candles, 3);
    expect(result[0].value).toBeCloseTo(-80, 10);
  });

  it("returns -50 (midpoint) when the period's range is zero", () => {
    const flat = [10, 10, 10].map((v, i) => candle(i, v, v, v));
    const result = williamsR(flat, 3);
    expect(result[0].value).toBe(-50);
  });
});
