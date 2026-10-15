import { describe, expect, it } from "vitest";
import { compileGraph, newBlock, wouldLoop, type Block } from "./graph";
import { evaluateFormula, parseFormula } from "./formula";

const candles = Array.from({ length: 80 }, (_, i) => {
  const close = 100 + Math.sin(i / 6) * 8 + i * 0.2;
  return { time: 1_700_000_000 + i * 86400, open: close - 0.5, high: close + 1.5, low: close - 1.5, close, volume: 1000 + i * 5 };
});

const b = (id: string, type: Parameters<typeof newBlock>[0], op: string, inputs: (string | null)[] = [], nums?: number[]): Block => ({ ...newBlock(type, op, 0, 0, id), inputs, ...(nums ? { nums } : {}) });
const value = (formula: string) => evaluateFormula(parseFormula(formula), candles);

describe("compileGraph", () => {
  it("turns wired blocks into the same formula you would write", () => {
    // (ema(close, 5) - ema(close, 20)) / atr(14)
    const blocks = [b("c", "price", "close"), b("e5", "window", "ema", ["c"], [5]), b("e20", "window", "ema", ["c"], [20]), b("d", "math", "-", ["e5", "e20"]), b("a", "indicator", "atr", [], [14]), b("r", "math", "/", ["d", "a"]), b("o", "output", "output", ["r"])];
    const r = compileGraph(blocks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formula).toBe("((ema(close, 5) - ema(close, 20)) / atr(14))");
    expect(value(r.formula).at(-1)).toBeCloseTo(value("(ema(close, 5) - ema(close, 20)) / atr(14)").at(-1)!);
  });
  it("names a block that feeds several others, so it is worked out once", () => {
    const blocks = [b("c", "price", "close"), b("s", "window", "sma", ["c"], [10]), b("d1", "math", "-", ["c", "s"]), b("d2", "math", "/", ["d1", "s"]), b("o", "output", "output", ["d2"])];
    const r = compileGraph(blocks);
    expect(r.ok && r.formula).toMatch(/sma_\d+ = sma\(close, 10\)/);
    if (r.ok) expect(value(r.formula).at(-1)).toBeCloseTo(value("(close - sma(close, 10)) / sma(close, 10)").at(-1)!);
  });
  it("builds comparisons, logic and if", () => {
    const blocks = [b("c", "price", "close"), b("e", "window", "ema", ["c"], [10]), b("g", "compare", ">", ["c", "e"]), b("v", "window", "zscore", ["c"], [20]), b("n", "number", "number", [], [0]), b("p", "compare", ">", ["v", "n"]), b("a", "logic", "and", ["g", "p"]), b("o", "output", "output", ["a"])];
    const r = compileGraph(blocks);
    expect(r.ok).toBe(true);
    if (r.ok) expect(value(r.formula).at(-1)).toBe(value("(close > ema(close, 10)) and (zscore(close, 20) > 0)").at(-1));
    const pick = compileGraph([b("c", "price", "close"), b("o1", "price", "open"), b("k", "compare", "crossover", ["c", "o1"]), b("u", "number", "number", [], [1]), b("z", "number", "number", [], [-1]), b("i", "logic", "if", ["k", "u", "z"]), b("o", "output", "output", ["i"])]);
    expect(pick.ok && pick.formula).toBe("if(crossover(close, open), 1, (-1))");
  });
  it("only gives a clear complaint when something is missing", () => {
    expect(compileGraph([])).toMatchObject({ ok: false, error: expect.stringMatching(/output block/) });
    expect(compileGraph([b("o", "output", "output", [null])])).toMatchObject({ ok: false, error: expect.stringMatching(/Wire something/) });
    const half = compileGraph([b("c", "price", "close"), b("d", "math", "-", ["c", null]), b("o", "output", "output", ["d"])]);
    expect(half).toMatchObject({ ok: false, blockId: "d", error: expect.stringMatching(/missing its b/) });
    expect(compileGraph([b("o", "output", "output", ["gone"])])).toMatchObject({ ok: false, error: expect.stringMatching(/no longer exists/) });
  });
  it("sees a loop before it is made", () => {
    const blocks = [b("c", "price", "close"), b("a", "math", "+", ["c", null]), b("d", "math", "*", ["a", "c"])];
    expect(wouldLoop(blocks, "d", "a")).toBe(true); // d reads a, so a can't read d
    expect(wouldLoop(blocks, "c", "a")).toBe(false);
    expect(wouldLoop(blocks, "a", "a")).toBe(true);
  });
  it("stays within the formula language for every window block", () => {
    for (const op of ["sma", "ema", "wma", "rma", "rsi", "stdev", "highest", "lowest", "sum", "change", "ref", "roc", "median", "variance", "zscore", "percentrank", "linreg", "slope", "normalize", "kalman", "fisher"]) {
      const r = compileGraph([b("c", "price", "close"), b("w", "window", op, ["c"]), b("o", "output", "output", ["w"])]);
      expect(r.ok, op).toBe(true);
      if (r.ok) expect(() => parseFormula(r.formula), op).not.toThrow();
    }
  });
  it("stays within the formula language for the indicator and structure blocks", () => {
    for (const op of ["atr", "adx", "cci", "mfi", "vwap", "obv", "supertrend", "fvgbull", "fvgbear", "swinghigh", "swinglow", "bosup", "bosdown", "sweephigh", "sweeplow", "minuteofday"]) {
      const r = compileGraph([b("w", "indicator", op), b("o", "output", "output", ["w"])]);
      expect(r.ok, op).toBe(true);
      if (r.ok) expect(() => parseFormula(r.formula), op).not.toThrow();
    }
  });
});
