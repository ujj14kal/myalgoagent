import { describe, expect, it } from "vitest";
import { toConditionNode } from "./conditions";
import { validateConditionNode } from "@/lib/strategy/validate";
import { checkConditionFeasibility } from "@/lib/strategy/validate-sanity";

const valid = (v: unknown) => {
  const node = toConditionNode(v);
  validateConditionNode(node);
  return node;
};

describe("toConditionNode", () => {
  it("reads strategy-language strings", () => {
    expect(valid("rsi(14) < 30")).toMatchObject({ kind: "comparison", operator: "LT" });
  });

  it("builds time windows, including 12-hour times", () => {
    expect(valid({ time_between: ["09:15", "09:30"] })).toEqual({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 570 } });
    expect(valid({ time_between: ["3:15 pm", "3:30 PM"] })).toMatchObject({ signal: { startMinute: 915, endMinute: 930 } });
  });

  it("builds candle, chart and volume patterns with optional timeframe", () => {
    expect(valid({ candle_pattern: "bullish engulfing", timeframe: "15m" })).toMatchObject({ signal: { family: "CANDLE_PATTERN", pattern: "BULLISH_ENGULFING", timeframe: "15m" } });
    expect(valid({ chart_pattern: "Double Bottom" })).toMatchObject({ signal: { family: "CHART_PATTERN", pattern: "DOUBLE_BOTTOM" } });
    expect(valid({ volume_pattern: "VOLUME_SPIKE", timeframe: "1h" })).toMatchObject({ signal: { family: "VOLUME_PATTERN", timeframe: "60m" } });
  });

  it("supports other timeframes, other instruments and AND / OR / NOT", () => {
    const node = valid({
      all: [
        { time_between: ["09:15", "10:00"] },
        { left: { indicator: "rsi", params: [14], timeframe: "5m" }, op: "crosses_above", right: 30 },
        { any: [{ candle_pattern: "HAMMER" }, { not: { left: "close", op: "<", right: { indicator: "sma", params: [50], symbol: "TCS" } } }] },
      ],
    });
    expect(node).toMatchObject({ kind: "group", op: "AND" });
    const json = JSON.stringify(node);
    expect(json).toContain('"timeframe":"5m"');
    expect(json).toContain('"instrumentSymbol":"TCS.NS"');
    expect(json).toContain('"kind":"not"');
  });

  it("fills missing indicator settings with the builder's defaults", () => {
    expect(valid({ left: { indicator: "macdline" }, op: "crosses_above", right: { indicator: "macdsignal" } })).toMatchObject({
      left: { params: [12, 26, 9] },
    });
  });

  it("accepts the wrapped shapes models tend to write", () => {
    expect(valid({ all: [{ comparison: { left: { indicator: "rsi", params: [14] }, op: "crosses_above", right: { value: 30 } } }, { and: [{ candle_pattern: "HAMMER" }] }] })).toMatchObject({
      kind: "group",
      children: [{ kind: "comparison", operator: "CROSSES_ABOVE", right: { kind: "constant", value: 30 } }, { kind: "group", op: "AND" }],
    });
  });

  it("explains mistakes clearly", () => {
    expect(() => toConditionNode({ candle_pattern: "flying unicorn" })).toThrow(/unknown candle pattern/);
    expect(() => toConditionNode({ time_between: ["10:00", "09:15"] })).toThrow(/end must be after its start/);
    expect(() => toConditionNode({ left: "close", op: "bigger", right: 5 })).toThrow(/"op" must be one of/);
    expect(() => toConditionNode({ left: { indicator: "rsi", timeframe: "3h" }, op: ">", right: 50 })).toThrow(/timeframe "3h"/);
  });

  it("works with the feasibility checker (e.g. RSI vs price is flagged)", () => {
    const node = valid({ left: { indicator: "rsi", params: [14] }, op: "crosses_above", right: "close" });
    expect(checkConditionFeasibility(node, "entry").length).toBeGreaterThan(0);
  });
});
