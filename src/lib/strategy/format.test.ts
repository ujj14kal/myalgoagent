import { describe, expect, it } from "vitest";
import { parseDsl } from "./dsl";
import { conditionToText } from "./format";

describe("conditionToText", () => {
  it("round-trips simple comparisons and crossovers through the parser", () => {
    for (const src of ["rsi(14) < 30", "ema(20) crossesAbove ema(50)", "close > sma(200)", "macdline(12,26,9) crossesBelow macdsignal(12,26,9)"]) {
      expect(parseDsl(conditionToText(parseDsl(src)))).toEqual(parseDsl(src));
    }
  });

  it("keeps and/or grouping readable and equivalent", () => {
    const src = "(rsi(14) < 30 and close > sma(200)) or cci(20) crossesBelow -100";
    const text = conditionToText(parseDsl(src));
    expect(parseDsl(text)).toEqual(parseDsl(src));
    expect(text).toContain(" or ");
  });

  it("describes non-comparison signals in words", () => {
    expect(conditionToText({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 600 } })).toBe("time between 09:15 and 10:00");
  });
});
