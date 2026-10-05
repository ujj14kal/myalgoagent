import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { conditionTruthPerBar, evaluateConditionsPerBar } from "./evaluate";
import { conditionToText } from "./format";
import { validateConditionNode } from "./validate";
import type { ConditionNode } from "./types";

const candle = (i: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open: close, high: close, low: close, close, volume: 1 });
// closes: 10 10 12 12 10 10 12 10
const candles = [10, 10, 12, 12, 10, 10, 12, 10].map((c, i) => candle(i, c));
const above = (n: number): ConditionNode => ({ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GT", right: { kind: "constant", value: n } });
const recent = (child: ConditionNode, bars: number, mode: "ANY" | "ALL", excludeCurrent = false): ConditionNode => ({ kind: "recent", child, bars, mode, excludeCurrent });

describe("recent (look-back) rules", () => {
  it("ANY: true if the rule held at least once in the window, this candle included", () => {
    // close > 11 on candles 2, 3 and 6
    expect(conditionTruthPerBar(candles, recent(above(11), 2, "ANY"))).toEqual([false, false, true, true, true, false, true, true]);
  });
  it("ANY, not this one: the rule must have held BEFORE this candle", () => {
    expect(conditionTruthPerBar(candles, recent(above(11), 2, "ANY", true))).toEqual([false, false, false, true, true, true, false, true]);
  });
  it("ALL: held on every candle of the window", () => {
    expect(conditionTruthPerBar(candles, recent(above(11), 2, "ALL"))).toEqual([false, false, false, true, false, false, false, false]);
  });
  it("ALL is false until a whole window of candles exists", () => {
    expect(conditionTruthPerBar(candles, recent(above(9), 3, "ALL"))).toEqual([false, false, true, true, true, true, true, true]);
  });
  it("one candle looks at this candle only (or the previous one)", () => {
    expect(conditionTruthPerBar(candles, recent(above(11), 1, "ANY"))).toEqual(conditionTruthPerBar(candles, above(11)));
    expect(conditionTruthPerBar(candles, recent(above(11), 1, "ANY", true))[3]).toBe(true);
  });
  it("never looks ahead: appending candles changes no earlier answer", () => {
    const node = recent(above(11), 3, "ANY");
    const short = conditionTruthPerBar(candles.slice(0, 5), node);
    const long = conditionTruthPerBar(candles, node);
    expect(long.slice(0, 5)).toEqual(short);
  });
  it("sequence: A happened first, then B now", () => {
    // A: close > 11 ; B: close < 11 → "after a high close, a low close within 2 candles"
    const below = (n: number): ConditionNode => ({ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "LT", right: { kind: "constant", value: n } });
    const sequence: ConditionNode = { kind: "group", op: "AND", children: [below(11), recent(above(11), 2, "ANY", true)] };
    expect(evaluateConditionsPerBar(candles, sequence, above(1000)).entry).toEqual([false, false, false, false, true, false, false, true]);
  });
  it("is read back as plain words", () => {
    expect(conditionToText(recent(above(11), 3, "ANY"))).toMatch(/was true within the last 3 candles/);
    expect(conditionToText(recent(above(11), 3, "ALL", true))).toMatch(/held on each of the last 3 candles before this one/);
  });
  it("is validated", () => {
    expect(() => validateConditionNode(recent(above(11), 3, "ANY"))).not.toThrow();
    expect(() => validateConditionNode({ kind: "recent", child: above(11), bars: 0, mode: "ANY" })).toThrow(/bars/);
    expect(() => validateConditionNode({ kind: "recent", child: above(11), bars: 3, mode: "SOME" })).toThrow(/mode/);
    expect(() => validateConditionNode({ kind: "recent", child: { kind: "nope" }, bars: 3, mode: "ANY" })).toThrow(/kind/);
  });
});
