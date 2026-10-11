import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { barMinutesOf, computeChartPatternSeries, thresholdsFor } from "./chart-patterns";

const T0 = Date.UTC(2026, 0, 5, 3, 45) / 1000; // 09:15 IST
/** Candles from a path of closes, `minutes` apart, each a hair wider than its close-to-close move. */
function series(closes: number[], minutes: number): Candle[] {
  return closes.map((c, i) => {
    const prev = closes[i - 1] ?? c;
    return { time: T0 + i * minutes * 60, open: prev, high: Math.max(prev, c) * 1.0002, low: Math.min(prev, c) * 0.9998, close: c, volume: 1000 };
  });
}
/** A double bottom: fall, bounce, retest the low, then break above the bounce — scaled to a total swing of `pct`. */
function doubleBottom(pct: number): number[] {
  const base = 1000;
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const low = base * (1 - pct);
  const mid = base * (1 - pct * 0.4);
  return [...Array.from({ length: 6 }, () => base), ...leg(base, low, 6), ...leg(low, mid, 6), ...leg(mid, low * 1.002, 6), ...leg(low * 1.002, base * (1 - pct * 0.1), 8), ...Array.from({ length: 4 }, () => base * (1 - pct * 0.1))];
}

describe("thresholds follow the candle size", () => {
  it("reads the candle length from their spacing", () => {
    expect(barMinutesOf(series(Array(30).fill(100), 15))).toBe(15);
    expect(barMinutesOf(series(Array(30).fill(100), 1))).toBe(1);
  });
  it("leaves daily candles alone and shrinks intraday ones", () => {
    const daily = series(Array(30).fill(100), 1440);
    expect(barMinutesOf(daily)).toBeNull();
    const d = thresholdsFor(daily);
    const i = thresholdsFor(series(Array(30).fill(100), 15));
    expect(d.swing).toBe(0.01);
    expect(i.swing).toBeLessThan(d.swing / 3);
    expect(i.pole).toBeLessThan(d.pole / 3);
  });
});

describe("chart patterns on short candles", () => {
  const fires = (candles: Candle[]) => computeChartPatternSeries(candles, "DOUBLE_BOTTOM").some(Boolean);
  it("finds a small double bottom on 15-minute candles, where a fixed 1% swing never could", () => {
    expect(fires(series(doubleBottom(0.006), 15))).toBe(true);
  });
  it("finds the same shape at daily size on daily candles", () => {
    expect(fires(series(doubleBottom(0.06), 1440))).toBe(true);
  });
  it("does not call a tiny wobble on daily candles a pattern", () => {
    expect(fires(series(doubleBottom(0.006), 1440))).toBe(false);
  });
});
