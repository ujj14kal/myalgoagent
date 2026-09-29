import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, parseFormula } from "./formula";

const candles = Array.from({ length: 60 }, (_, i) => {
  const close = 100 + Math.sin(i / 5) * 10 + i * 0.5;
  return { time: 1_700_000_000 + i * 86400, open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 + i };
});
const at = (formula: string, i: number) => evaluateFormula(parseFormula(formula), candles)[i];

describe("formula parsing", () => {
  it("parses arithmetic, precedence and functions", () => {
    expect(at("1 + 2 * 3", 0)).toBe(7);
    expect(at("(1 + 2) * 3", 0)).toBe(9);
    expect(at("-2 ^ 2", 0)).toBe(-4);
    expect(at("close - open", 5)).toBeCloseTo(1);
    expect(at("hl2", 3)).toBeCloseTo(candles[3].close);
  });
  it("gives plain-English errors", () => {
    for (const [f, msg] of [
      ["", /Write a formula/],
      ["close +", /ends too early/],
      ["sma(close)", /source and a length/],
      ["sma(close, 0)", /whole number/],
      ["foo(close)", /no function called foo/],
      ["price", /Unknown name "price"/],
      ["close; drop", /isn't allowed/],
      ["(close", /closing/],
    ] as const)
      expect(() => parseFormula(f)).toThrow(msg);
    expect(() => parseFormula("x".repeat(600))).toThrow(FormulaError);
  });
});

describe("formula values", () => {
  it("windows are undefined until they have enough bars, then match a hand calculation", () => {
    const v = evaluateFormula(parseFormula("sma(close, 3)"), candles);
    expect(v[1]).toBeNaN();
    expect(v[2]).toBeCloseTo((candles[0].close + candles[1].close + candles[2].close) / 3);
    expect(at("highest(high, 5)", 10)).toBe(Math.max(...candles.slice(6, 11).map((c) => c.high)));
    expect(at("ref(close, 2)", 10)).toBe(candles[8].close);
    expect(at("change(close)", 10)).toBeCloseTo(candles[10].close - candles[9].close);
  });
  it("uses built-in indicators by name and combines them", () => {
    const v = at("(ema(close, 5) - ema(close, 20)) / atr(14)", 40);
    expect(Number.isFinite(v)).toBe(true);
    expect(at("rsi(14)", 40)).toBeCloseTo(at("rsi(close, 14)", 40), 1);
  });
  it("comparisons and if() produce 1/0 and choices", () => {
    expect(at("close > open", 5)).toBe(1);
    expect(at("if(close > open, 10, 20)", 5)).toBe(10);
    expect(at("close > open and volume > 5000", 5)).toBe(0);
  });
});
