import { describe, it, expect } from "vitest";
import { checkConditionFeasibility } from "@/lib/strategy/validate-sanity";
import type { ConditionNode } from "@/lib/strategy/types";

describe("oscillator / off-price-scale indicator mismatch (server-side backstop for the visual builder's restriction)", () => {
  it("flags an oscillator compared to a price-scale indicator", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "RSI", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "EMA", params: [50] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("RSI(14)");
  });

  it("flags ATR (a volatility magnitude, not a price level) compared to raw price — the real, live-confirmed bug: close is always far above ATR, so this can never fire", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "price", field: "CLOSE" },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "ATR", params: [14] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("ATR(14)");
  });

  it("flags Standard Deviation compared to a price-scale indicator", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "STDDEV", params: [20] },
      operator: "GT",
      right: { kind: "indicator", type: "SMA", params: [20] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
  });

  it("allows ATR compared to a fixed threshold (a real volatility-spike condition)", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "ATR", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "constant", value: 50 },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("flags an oscillator compared to a raw price field", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "price", field: "CLOSE" },
      operator: "GT",
      right: { kind: "indicator", type: "CCI", params: [20] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("CCI(20)");
  });

  it("flags two different oscillators compared to each other", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "RSI", params: [14] },
      operator: "GT",
      right: { kind: "indicator", type: "STOCH_K", params: [14, 3] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
  });

  it("allows an oscillator compared to a fixed threshold", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "RSI", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "constant", value: 70 },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows two price-scale indicators compared to each other", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "SMA", params: [20] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "EMA", params: [50] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows a price-scale indicator compared to a raw price field", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "price", field: "CLOSE" },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "BB_UPPER", params: [20, 2] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });
});

describe("paired oscillators stay comparable — each is the standard signal that indicator is known for; an earlier version of this rule broke all four, caught live while building a real MACD strategy for a backtest", () => {
  it("allows MACD Line crossing its own Signal line", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "MACD_LINE", params: [12, 26, 9] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "MACD_SIGNAL", params: [12, 26, 9] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows MACD Histogram compared to MACD Line (same family)", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "MACD_HISTOGRAM", params: [12, 26, 9] },
      operator: "GT",
      right: { kind: "indicator", type: "MACD_LINE", params: [12, 26, 9] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows Stochastic %K crossing %D", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "STOCH_K", params: [14, 3] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "STOCH_D", params: [14, 3] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows +DI crossing -DI", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "PLUS_DI", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "MINUS_DI", params: [14] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("allows Aroon Up crossing Aroon Down", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "AROON_UP", params: [25] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "AROON_DOWN", params: [25] },
    };
    expect(checkConditionFeasibility(node, "entry")).toEqual([]);
  });

  it("still flags MACD Line compared to an unrelated oscillator (RSI) — pairing is family-specific, not 'any two oscillators'", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "MACD_LINE", params: [12, 26, 9] },
      operator: "GT",
      right: { kind: "indicator", type: "RSI", params: [14] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
  });

  it("still flags Stochastic %K compared to ADX — both 0-100 scale, but not the same paired family", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "STOCH_K", params: [14, 3] },
      operator: "GT",
      right: { kind: "indicator", type: "ADX", params: [14] },
    };
    const issues = checkConditionFeasibility(node, "entry");
    expect(issues).toHaveLength(1);
  });
});
