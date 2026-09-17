import { describe, it, expect } from "vitest";
import { checkConditionFeasibility } from "@/lib/strategy/validate-sanity";
import type { ConditionNode } from "@/lib/strategy/types";

describe("oscillator scale mismatch (server-side backstop for the visual builder's restriction)", () => {
  it("flags an oscillator compared to a price-scale indicator", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "RSI", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "EMA", params: [50] },
    };
    const issues = checkConditionFeasibility(node, "ENTRY");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("RSI(14)");
    expect(issues[0].message).toContain("oscillator");
  });

  it("flags an oscillator compared to a raw price field", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "price", field: "CLOSE" },
      operator: "GT",
      right: { kind: "indicator", type: "CCI", params: [20] },
    };
    const issues = checkConditionFeasibility(node, "ENTRY");
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
    const issues = checkConditionFeasibility(node, "ENTRY");
    expect(issues).toHaveLength(1);
  });

  it("allows an oscillator compared to a fixed threshold", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "RSI", params: [14] },
      operator: "CROSSES_ABOVE",
      right: { kind: "constant", value: 70 },
    };
    expect(checkConditionFeasibility(node, "ENTRY")).toEqual([]);
  });

  it("allows two price-scale indicators compared to each other", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "indicator", type: "SMA", params: [20] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "EMA", params: [50] },
    };
    expect(checkConditionFeasibility(node, "ENTRY")).toEqual([]);
  });

  it("allows a price-scale indicator compared to a raw price field", () => {
    const node: ConditionNode = {
      kind: "comparison",
      left: { kind: "price", field: "CLOSE" },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "BB_UPPER", params: [20, 2] },
    };
    expect(checkConditionFeasibility(node, "ENTRY")).toEqual([]);
  });
});
