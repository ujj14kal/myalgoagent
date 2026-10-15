import { describe, expect, it } from "vitest";
import type { CustomIndicatorDef } from "./index";
import { checkIntegrity, estimateCost, timingNotes } from "./integrity";

const candles = Array.from({ length: 160 }, (_, i) => {
  const close = 100 + Math.sin(i / 6) * 8 + i * 0.1;
  return { time: 1_700_000_000 + i * 86400, open: close - 0.5, high: close + 1.5, low: close - 1.5, close, volume: 1000 + i };
});
const formula = (f: string): CustomIndicatorDef => ({ type: "formula", formula: f, pane: "separate" });

describe("checkIntegrity", () => {
  it("passes an ordinary indicator", () => {
    const r = checkIntegrity(candles, formula("(ema(close, 5) - ema(close, 20)) / atr(14)"));
    expect(r.stable).toBe(true);
    expect(r.verdict).toMatch(/No repainting found/);
  });
  it("passes confirmed pivots and closed higher-timeframe values", () => {
    expect(checkIntegrity(candles, formula("swinghigh(4) - swinglow(4)")).stable).toBe(true);
    expect(checkIntegrity(candles, formula("htf(1440, close)")).stable).toBe(true);
  });
  it("passes signals, bands and drawn levels", () => {
    expect(checkIntegrity(candles, { type: "signal", formula: "crossover(close, sma(close, 10))" }).stable).toBe(true);
    expect(checkIntegrity(candles, { type: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)" }).stable).toBe(true);
    expect(checkIntegrity(candles, { type: "level", price: 105 }).stable).toBe(true);
  });
  it("catches a calculation that reads the next candle", () => {
    const peek = (c: typeof candles) => c.map((_, i) => (i + 1 < c.length ? c[i + 1].close : NaN));
    const r = checkIntegrity(candles, formula("close"), 5, (c) => peek(c));
    expect(r.stable).toBe(false);
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.verdict).toMatch(/repaints/);
  });
  it("catches a pivot that is read at its own bar instead of after it is confirmed", () => {
    // The swing high is marked on the candle where it formed, which is only known 3 candles later.
    const early = (c: typeof candles) => c.map((x, i) => (i >= 3 && i + 3 < c.length && c.slice(i - 3, i + 4).every((y, j) => j === 3 || y.high < x.high) ? x.high : 0));
    expect(checkIntegrity(candles, formula("close"), 5, (c) => early(c)).stable).toBe(false);
  });
  it("says so when there is too little history", () => {
    expect(checkIntegrity(candles.slice(0, 20), formula("close")).verdict).toMatch(/Not enough candles/);
  });
});

describe("timing notes and cost", () => {
  it("explains pivots and bigger candles in words", () => {
    const n = timingNotes(formula("a = pivothigh(5)\nb = htf(60, close)\na + b"));
    expect(n.join(" ")).toMatch(/5 candles after/);
    expect(n.join(" ")).toMatch(/last fully closed 60-minute/);
  });
  it("sizes a formula", () => {
    expect(estimateCost(formula("close - open")).level).toBe("light");
    expect(estimateCost(formula("htf(60, median(close, 200)) + percentile(close, 300, 80) + correlation(close, volume, 200) + swinghigh(5) + swinglow(5)")).level).not.toBe("light");
  });
});
