import { describe, it, expect } from "vitest";
import { parseDsl } from "@/lib/strategy/dsl";

describe("DSL — negative number literals", () => {
  it("parses a negative constant on the right side of a comparison", () => {
    const node = parseDsl("cci(20) crossesBelow -100");
    expect(node).toEqual({
      kind: "comparison",
      left: { kind: "indicator", type: "CCI", params: [20] },
      operator: "CROSSES_BELOW",
      right: { kind: "constant", value: -100 },
    });
  });

  it("parses a negative decimal constant", () => {
    const node = parseDsl("williamsr(14) < -80.5");
    expect(node).toEqual({
      kind: "comparison",
      left: { kind: "indicator", type: "WILLIAMS_R", params: [14] },
      operator: "LT",
      right: { kind: "constant", value: -80.5 },
    });
  });

  it("parses a negative number as an indicator's own parameter", () => {
    // Not a realistic indicator param in practice, but the tokenizer
    // should still handle it the same way rather than special-casing
    // comparison operands only.
    const node = parseDsl("roc(-5) crossesAbove 0");
    expect(node.kind).toBe("comparison");
    if (node.kind === "comparison" && node.left.kind === "indicator") {
      expect(node.left.params).toEqual([-5]);
    }
  });

  it("still parses ordinary positive numbers and doesn't regress plain crossovers", () => {
    const node = parseDsl("sma(20) crossesAbove ema(50)");
    expect(node).toEqual({
      kind: "comparison",
      left: { kind: "indicator", type: "SMA", params: [20] },
      operator: "CROSSES_ABOVE",
      right: { kind: "indicator", type: "EMA", params: [50] },
    });
  });
});
