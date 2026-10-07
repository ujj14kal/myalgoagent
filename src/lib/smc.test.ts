import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { computeSmcSeries, SMC_KINDS, type SmcSide } from "./smc";

const c = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 300, open, high, low, close, volume: 1000 });
/** A candle around a mid price: body from o to cl, wicks to hi / lo. */
const k = (i: number, o: number, cl: number, hi = Math.max(o, cl) + 0.5, lo = Math.min(o, cl) - 0.5) => c(i, o, hi, lo, cl);
const at = (s: boolean[]) => s.flatMap((v, i) => (v ? [i] : []));

// Up to a swing high at 105 (index 3), down to a swing low at 99 (index 7), then a rally that breaks 105.
const structure = [
  k(0, 100, 101), k(1, 101, 103), k(2, 103, 104), k(3, 104, 104.5, 105, 103.5), k(4, 104, 102), k(5, 102, 101), k(6, 101, 100),
  k(7, 100, 99.6, 100.2, 99), k(8, 99.6, 100.5), k(9, 100.5, 101.5), k(10, 101.5, 102.5), k(11, 102.5, 104), k(12, 104, 106, 106.2, 103.8), k(13, 106, 107),
];

describe("break of structure", () => {
  it("fires on the first close above the confirmed swing high, once", () => {
    expect(at(computeSmcSeries(structure, "BOS", "BULLISH", { swing: 2 }))).toEqual([12]);
  });
  it("a bearish BOS after a bullish one is a change of character", () => {
    const fall = [...structure, k(14, 107, 105), k(15, 105, 103), k(16, 103, 101), k(17, 101, 98.5)];
    expect(at(computeSmcSeries(fall, "BOS", "BEARISH", { swing: 2 }))).toEqual([17]);
    expect(at(computeSmcSeries(fall, "CHOCH", "BEARISH", { swing: 2 }))).toEqual([17]);
    expect(at(computeSmcSeries(fall, "CHOCH", "BULLISH", { swing: 2 }))).toEqual([]); // the first BOS has nothing before it
  });
});

describe("liquidity sweep", () => {
  it("a wick under the swing low that closes back above it", () => {
    const sweep = [...structure.slice(0, 11), k(11, 102.5, 101, 102.6, 100.5), k(12, 101, 100.8, 101.2, 98.6), k(13, 100.8, 101.5)];
    // index 12: low 98.6 < swing low 99, close 100.8 > 99.
    expect(at(computeSmcSeries(sweep.map((x, i) => (i === 12 ? { ...x, close: 100.8 } : x)), "LIQUIDITY_SWEEP", "BULLISH", { swing: 2 }))).toEqual([12]);
  });
  it("a close through the level is a break, not a sweep", () => {
    const brk = [...structure.slice(0, 11), k(11, 100.5, 98.5, 100.6, 98)];
    expect(at(computeSmcSeries(brk, "LIQUIDITY_SWEEP", "BULLISH", { swing: 2 }))).toEqual([]);
  });
});

describe("fair value gaps", () => {
  // Candle 2's low (103) sits above candle 0's high (101): a bullish gap 101–103, retested at candle 5.
  const gap = [c(0, 100, 101, 99.5, 100.8), c(1, 101, 104, 100.8, 103.8), c(2, 103.8, 105, 103, 104.8), c(3, 104.8, 106, 103.6, 105.5), c(4, 105.5, 106, 104, 104.2), c(5, 104.2, 104.3, 102.5, 103.2), c(6, 103.2, 104, 102.6, 103.5)];
  it("detects the gap on the third candle", () => expect(at(computeSmcSeries(gap, "FVG", "BULLISH"))).toEqual([2]));
  it("detects the retest once", () => expect(at(computeSmcSeries(gap, "FVG_RETEST", "BULLISH"))).toEqual([5]));
  it("ignores gaps smaller than the minimum", () => expect(at(computeSmcSeries(gap, "FVG", "BULLISH", { minGapPct: 5 }))).toEqual([]));
  it("a gap closed through is no longer a retest", () => {
    const filled = gap.map((x, i) => (i === 5 ? { ...x, low: 100, close: 100.5 } : x));
    expect(at(computeSmcSeries(filled, "FVG_RETEST", "BULLISH"))).toEqual([]);
  });
  it("gaps expire after maxAge", () => expect(at(computeSmcSeries(gap, "FVG_RETEST", "BULLISH", { maxAge: 2 }))).toEqual([]));
});

describe("order block retest", () => {
  it("returns into the last down candle before the bullish break", () => {
    const ob = [...structure, k(14, 107, 105.5, 107.1, 105.3), k(15, 105.5, 104.4, 105.6, 99.8)];
    // The last down candle before the break at 12 within the leg is candle 7 (100 → 99.6, range 99–100.2): retested at 15.
    expect(at(computeSmcSeries(ob, "ORDER_BLOCK_RETEST", "BULLISH", { swing: 2 }))).toEqual([15]);
  });
});

describe("no look-ahead", () => {
  // A random walk: each detector's answer on candle t must be the same whether or not later candles exist.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const walk: Candle[] = [];
  let p = 100;
  for (let i = 0; i < 220; i++) {
    const o = p;
    p = Math.max(5, p + rnd() * 3);
    walk.push(c(i, o, Math.max(o, p) + Math.abs(rnd()) * 1.5, Math.min(o, p) - Math.abs(rnd()) * 1.5, p));
  }
  for (const kind of SMC_KINDS)
    for (const side of ["BULLISH", "BEARISH"] as SmcSide[])
      it(`${kind} ${side}`, () => {
        const full = computeSmcSeries(walk, kind, side, { swing: 3, maxAge: 25 });
        for (let t = 10; t < walk.length; t += 7) expect(computeSmcSeries(walk.slice(0, t + 1), kind, side, { swing: 3, maxAge: 25 })[t]).toBe(full[t]);
        expect(full.some(Boolean)).toBe(true); // and it does fire on real-looking data
      });
});

describe("in rules", () => {
  it("evaluates, validates, reads back and parses from the agent", async () => {
    const { evaluateStrategy } = await import("@/lib/strategy/evaluate");
    const { validateConditionNode } = await import("@/lib/strategy/validate");
    const { conditionToText } = await import("@/lib/strategy/format");
    const { toConditionNode } = await import("@/lib/ai/conditions");
    const node = toConditionNode({ smc: "break of structure", side: "bullish", swing: 2 });
    expect(node).toEqual({ kind: "signal", signal: { family: "SMC", pattern: "BOS", side: "BULLISH", swing: 2 } });
    expect(() => validateConditionNode(node)).not.toThrow();
    expect(conditionToText(node)).toBe("bullish break of structure (BOS) (2-candle swings)");
    const never = { kind: "comparison" as const, left: { kind: "constant" as const, value: 0 }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };
    expect(evaluateStrategy(structure, node, never).find((s) => s.type === "entry")?.time).toBe(structure[12].time);
    expect(() => toConditionNode({ smc: "BOS" })).toThrow(/side/);
    expect(() => validateConditionNode({ kind: "signal", signal: { family: "SMC", pattern: "BOS", side: "BULLISH", swing: 0 } } as never)).toThrow(/whole number/);
  });
});
