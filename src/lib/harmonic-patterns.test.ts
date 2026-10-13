import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { computeChartPatternSeries, type ChartPatternKind } from "@/lib/chart-patterns";

// Builds candles that walk through the given turning points in straight legs of `bars` candles each.
function walk(points: number[], bars = 12): Candle[] {
  const out: Candle[] = [];
  let t = 1_700_000_000;
  const push = (c: number, prev: number) => {
    out.push({ time: t, open: prev, high: Math.max(prev, c) + 0.2, low: Math.min(prev, c) - 0.2, close: c, volume: 1000 });
    t += 86_400;
  };
  let prev = points[0];
  push(points[0], points[0]);
  for (let i = 1; i < points.length; i++) {
    for (let k = 1; k <= bars; k++) {
      const c = points[i - 1] + ((points[i] - points[i - 1]) * k) / bars;
      push(c, prev);
      prev = c;
    }
  }
  return out;
}

/** X low, A high, B, C, D low from the ratios (XA = 100): AB/XA = b, BC/AB = c, CD/BC = cd. */
function xabcd(b: number, c: number, cd: number, mirror = false): Candle[] {
  const X = 100;
  const A = 200;
  const B = A - b * 100;
  const C = B + c * (A - B);
  const D = C - cd * (C - B);
  // Lead in from above so X is a real swing low, and a bounce after D so D is confirmed.
  const pts = [130, X, A, B, C, D, D + 25];
  const prices = mirror ? pts.map((p) => 300 - p) : pts;
  return walk(prices);
}

const fired = (candles: Candle[], p: ChartPatternKind) => computeChartPatternSeries(candles, p).filter(Boolean).length;

describe("harmonic patterns (XABCD)", () => {
  it("finds a bullish Gartley exactly once, when its last swing is confirmed", () => {
    // B 61.8% of XA, D at 78.6% of XA: with BC/AB = 0.618, CD = 1.5 BC gives AD/XA of about 0.81 (within tolerance).
    const c = xabcd(0.618, 0.618, 1.5);
    expect(fired(c, "BULLISH_GARTLEY")).toBe(1);
    expect(fired(c, "BEARISH_GARTLEY")).toBe(0);
    expect(fired(c, "BULLISH_BAT")).toBe(0);
    expect(fired(c, "BULLISH_CRAB")).toBe(0);
  });
  it("finds the bearish mirror", () => {
    const c = xabcd(0.618, 0.618, 1.5, true);
    expect(fired(c, "BEARISH_GARTLEY")).toBe(1);
    expect(fired(c, "BULLISH_GARTLEY")).toBe(0);
  });
  it("finds a bullish Bat (B 38.2-50%, D at 88.6%)", () => {
    // B at 50% of XA (150), C 70% back up AB (185), D at 88.6% of XA: CD/BC is about 2.1, inside the Bat's 1.618-2.618.
    const A = 200;
    const B = 150;
    const C = 185;
    const D = A - 0.886 * 100;
    expect((A - D) / 100).toBeGreaterThan(0.85);
    expect((A - D) / 100).toBeLessThan(0.93);
    expect(fired(walk([130, 100, A, B, C, D, D + 25]), "BULLISH_BAT")).toBe(1);
  });
  it("does not fire when the ratios are not harmonic", () => {
    const c = xabcd(0.9, 0.2, 1.0);
    for (const p of ["BULLISH_GARTLEY", "BULLISH_BAT", "BULLISH_BUTTERFLY", "BULLISH_CRAB"] as const) expect(fired(c, p)).toBe(0);
  });
  it("is stable when later candles are cut off (no look-ahead)", () => {
    const full = xabcd(0.618, 0.618, 1.5);
    const cut = full.slice(0, Math.floor(full.length * 0.9));
    const f = computeChartPatternSeries(full, "BULLISH_GARTLEY");
    const t = computeChartPatternSeries(cut, "BULLISH_GARTLEY");
    expect(t).toEqual(f.slice(0, cut.length));
  });
});
