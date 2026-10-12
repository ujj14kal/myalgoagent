import { describe, expect, it } from "vitest";
import { DEMO_BASE, bestSeed, risingEdges, sampleCandles } from "./sample-chart";

describe("sampleCandles", () => {
  it("starts at ₹1,000 and is the same every time for a seed", () => {
    const a = sampleCandles(3);
    expect(a[0].open).toBe(DEMO_BASE);
    expect(sampleCandles(3)).toEqual(a);
    expect(sampleCandles(4)).not.toEqual(a);
  });
  it("makes sensible candles on weekdays only, in time order", () => {
    const c = sampleCandles(5, 60);
    expect(c).toHaveLength(60);
    for (let i = 0; i < c.length; i++) {
      expect(c[i].high).toBeGreaterThanOrEqual(Math.max(c[i].open, c[i].close));
      expect(c[i].low).toBeLessThanOrEqual(Math.min(c[i].open, c[i].close));
      expect(c[i].volume).toBeGreaterThan(0);
      if (i) expect(c[i].time).toBeGreaterThan(c[i - 1].time);
      const wd = new Date(c[i].time * 1000).getUTCDay();
      expect(wd === 0 || wd === 6).toBe(false);
    }
  });
  it("moves like a market, not a straight line", () => {
    const c = sampleCandles(7);
    const ups = c.filter((x) => x.close > x.open).length;
    expect(ups).toBeGreaterThan(c.length * 0.25);
    expect(ups).toBeLessThan(c.length * 0.75);
  });
});

describe("bestSeed / risingEdges", () => {
  it("keeps the best chart it saw, and stops early on a perfect one", () => {
    const fires = (c: ReturnType<typeof sampleCandles>) => c.filter((x, i) => i > 0 && x.close > c[i - 1].high).length;
    const target = -Math.abs(fires(sampleCandles(1)) - 20); // whatever seed 1 scores is attainable
    const r = bestSeed((c) => -Math.abs(fires(c) - 20), 0);
    expect(r.score).toBeGreaterThanOrEqual(target);
    expect(r.candles).toEqual(sampleCandles(r.seed));
    expect(bestSeed(() => 5, 5, 60).seed).toBe(1);
  });
  it("counts the moments a rule turns on", () => {
    expect(risingEdges([false, true, true, false, true])).toEqual([1, 4]);
    expect(risingEdges([true, true])).toEqual([0]);
  });
});
