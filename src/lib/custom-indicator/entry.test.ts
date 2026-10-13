import { describe, expect, it } from "vitest";
import { describeCustom, parseEntry, validateCustomDef } from "./index";
import { draftDefFrom } from "@/lib/ai/custom-indicator-arg";

describe("an indicator's own entry rule", () => {
  it("is kept by validation and described in words", () => {
    const def = validateCustomDef({ type: "formula", formula: "rsi(close, 14)", pane: "separate", entry: { operator: "CROSSES_ABOVE", value: 30 } });
    expect(def.entry).toEqual({ operator: "CROSSES_ABOVE", value: 30 });
    expect(describeCustom(def)).toContain("entry: it crosses above 30");
  });
  it("can be about price versus the indicator (no number)", () => {
    const def = validateCustomDef({ type: "formula", formula: "sma(close, 20)", pane: "price", entry: { operator: "CROSSES_ABOVE" } });
    expect(describeCustom(def)).toContain("entry: price crosses above it");
  });
  it("rejects nonsense and is optional", () => {
    expect(() => parseEntry({ operator: "SIDEWAYS" })).toThrow(/entry rule/);
    expect(validateCustomDef({ type: "level", price: 100 }).entry).toBeUndefined();
  });
  it("comes from the agent's entry_operator and entry_value", () => {
    expect(draftDefFrom({ kind: "graph line", formula: "rsi(close, 14)", entry_operator: "crosses above", entry_value: 30 }).entry).toEqual({ operator: "CROSSES_ABOVE", value: 30 });
    expect(() => draftDefFrom({ kind: "graph line", formula: "rsi(close, 14)", entry_operator: "sideways" })).toThrow(/entry_operator/);
  });
});
