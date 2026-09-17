import { describe, it, expect } from "vitest";
import { macd, bollingerBands, vwap, envelope } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/** Batch 5 (Phase B): MACD, Bollinger Bands, VWAP, Envelope. Expected
 * values computed independently by hand, in exact fractions where the
 * arithmetic isn't a clean decimal, to avoid floating-point brittleness
 * hiding a real mismatch. */

function candle(time: number, close: number, volume = 0, high?: number, low?: number): Candle {
  return { time, open: close, high: high ?? close, low: low ?? close, close, volume };
}

describe("MACD — fast EMA minus slow EMA, plus a signal-line EMA of that difference", () => {
  it("hand-traces fast=2/slow=3/signal=2 across the full chain", () => {
    const closes = [10, 20, 15, 25, 30];
    const candles = closes.map((c, i) => candle(i, c));

    // emaFast(2): seed=(10+20)/2=15 @1, k=2/3
    //   @2: 15*(2/3)+15*(1/3)=15
    //   @3: 25*(2/3)+15*(1/3)=65/3
    //   @4: 30*(2/3)+(65/3)*(1/3)=245/9
    // emaSlow(3): seed=(10+20+15)/3=15 @2, k=0.5
    //   @3: 25*0.5+15*0.5=20
    //   @4: 30*0.5+20*0.5=25
    // macdLine @2: 15-15=0; @3: 65/3-20=5/3; @4: 245/9-25=20/9
    // signal(2): seed=(0+5/3)/2=5/6 @3, k=2/3
    //   @4: (20/9)*(2/3)+(5/6)*(1/3) = 40/27+5/18 = 95/54
    // histogram @3: 5/3-5/6=5/6; @4: 20/9-95/54=25/54
    const { macd: macdLine, signal, histogram } = macd(candles, 2, 3, 2);

    expect(macdLine.map((p) => p.value)).toEqual([0, expect.closeTo(5 / 3, 10), expect.closeTo(20 / 9, 10)]);
    expect(signal.map((p) => p.value)).toEqual([expect.closeTo(5 / 6, 10), expect.closeTo(95 / 54, 10)]);
    expect(histogram.map((p) => p.value)).toEqual([expect.closeTo(5 / 6, 10), expect.closeTo(25 / 54, 10)]);
  });
});

describe("Bollinger Bands", () => {
  it("middle = SMA, upper/lower = middle +/- multiplier * population stddev", () => {
    const candles = [10, 20, 15].map((c, i) => candle(i, c));
    // mean=15, variance=((10-15)^2+(20-15)^2+0)/3=50/3, std=sqrt(50/3)
    const std = Math.sqrt(50 / 3);
    const { upper, middle, lower } = bollingerBands(candles, 3, 2);
    expect(middle[0].value).toBe(15);
    expect(upper[0].value).toBeCloseTo(15 + 2 * std, 10);
    expect(lower[0].value).toBeCloseTo(15 - 2 * std, 10);
  });
});

describe("VWAP — cumulative typical-price-weighted average", () => {
  it("matches cumulative(TP*volume) / cumulative(volume)", () => {
    // TP = (H+L+C)/3; using H=L=C so TP=close for simplicity
    const candles = [candle(0, 9, 100), candle(1, 10, 200), candle(2, 8, 150)];
    // VWAP0 = 9*100/100 = 9
    // VWAP1 = (900+2000)/300 = 29/3
    // VWAP2 = (2900+1200)/450 = 41/4.5 = 4100/450 = 41/4.5
    const result = vwap(candles);
    expect(result[0].value).toBeCloseTo(9, 10);
    expect(result[1].value).toBeCloseTo(2900 / 300, 10);
    expect(result[2].value).toBeCloseTo(4100 / 450, 10);
  });

  it("falls back to the typical price itself when cumulative volume is 0", () => {
    const candles = [candle(0, 9, 0)];
    const result = vwap(candles);
    expect(result[0].value).toBe(9);
  });
});

describe("Envelope — SMA +/- a fixed percentage band", () => {
  it("matches middle*(1+pct/100) and middle*(1-pct/100)", () => {
    const candles = [10, 20, 15].map((c, i) => candle(i, c));
    // SMA(3) = 15
    const { upper, lower } = envelope(candles, 3, 2.5);
    expect(upper[0].value).toBeCloseTo(15 * 1.025, 10);
    expect(lower[0].value).toBeCloseTo(15 * 0.975, 10);
  });
});
