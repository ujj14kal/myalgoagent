import { describe, expect, it } from "vitest";
import { draftDefFrom, draftLink } from "./custom-indicator-arg";
import { fillCustomRefs, toConditionNode } from "./conditions";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

describe("draft_custom_indicator arguments", () => {
  it("builds every kind", () => {
    expect(draftDefFrom({ kind: "graph line", formula: "volume / sma(volume, 20)" })).toEqual({ type: "formula", formula: "volume / sma(volume, 20)", pane: "separate" });
    expect(draftDefFrom({ formula: "sma(close, 20)", pane: "price" })).toMatchObject({ type: "formula", pane: "price" }); // older calls without a kind
    expect(draftDefFrom({ kind: "signal markers", formula: "crossover(ema(close, 20), ema(close, 50))" })).toMatchObject({ type: "signal" });
    expect(draftDefFrom({ kind: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)" })).toEqual({ type: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)" });
    expect(draftDefFrom({ kind: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)", pane: "price" })).toMatchObject({ type: "band", pane: "price" });
    expect(draftDefFrom({ kind: "level", price: "2500" })).toEqual({ type: "level", price: 2500 });
    expect(draftDefFrom({ kind: "zone", upper: 2450, lower: 2400 })).toEqual({ type: "zone", upper: 2450, lower: 2400 });
    const rect = draftDefFrom({ kind: "rectangle", upper: 2450, lower: 2400, from: "2026-09-01", to: "2026-09-30" });
    expect(rect).toMatchObject({ type: "zone", from: Date.parse("2026-09-01T00:00:00+05:30") / 1000, to: Date.parse("2026-09-30T23:59:59+05:30") / 1000 });
  });
  it("explains what to fix", () => {
    expect(() => draftDefFrom({ kind: "rectangle", upper: 2, lower: 1, from: "2026-09-01" })).toThrow(/both from and to/);
    expect(() => draftDefFrom({ kind: "zone", upper: 2, lower: 1, from: "1 Sep" })).toThrow(/YYYY-MM-DD/);
    expect(() => draftDefFrom({ kind: "band", middle: "sma(close, 20)" })).toThrow(/width/);
    expect(() => draftDefFrom({ kind: "pentagon" })).toThrow(/kind must be one of/);
  });
  it("links with short readable parameters that read back to the same definition", () => {
    expect(draftLink({ type: "formula", formula: "close", pane: "price" }, "C", "")).toBe("/app/indicators?name=C&formula=close&pane=price");
    expect(draftLink({ type: "zone", upper: 2, lower: 1 }, "Z", "")).toBe("/app/indicators?name=Z&kind=zone&upper=2&lower=1");
    const defs = [
      draftDefFrom({ kind: "signal markers", formula: "close > open" }),
      draftDefFrom({ kind: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)", middle: "sma(close, 20)", pane: "separate" }),
      draftDefFrom({ kind: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)" }),
      draftDefFrom({ kind: "level", price: 2500, from: "2026-09-01" }),
      draftDefFrom({ kind: "zone", upper: 2450, lower: 2400, from: "2026-09-01" }),
      draftDefFrom({ kind: "rectangle", upper: 2450, lower: 2400, from: "2026-09-01", to: "2026-09-30" }),
    ];
    for (const def of defs) {
      const sp = Object.fromEntries(new URL(draftLink(def, "N", ""), "https://x").searchParams);
      expect(draftDefFrom(sp)).toEqual(def);
    }
  });
});

describe("custom parts in the agent's rules", () => {
  const saved = new Map<string, CustomIndicatorDef>([
    ["Demand zone", { type: "zone", upper: 2450, lower: 2400 }],
    ["Trend", { type: "formula", formula: "close", pane: "price" }],
  ]);
  const rule = (left: unknown) => toConditionNode({ left, op: ">", right: 0 }, "entry");
  it("keeps the part for a zone", () => {
    const node = fillCustomRefs(rule({ custom: "demand zone", part: "lower" }), saved);
    expect(node).toMatchObject({ left: { kind: "custom", name: "Demand zone", part: "lower" } });
  });
  it("asks for a part when a zone is used without one", () => {
    expect(() => fillCustomRefs(rule({ custom: "Demand zone" }), saved)).toThrow(/add "part"/);
  });
  it("drops a stray part on a single-line indicator", () => {
    const node = fillCustomRefs(rule({ custom: "Trend", part: "upper" }), saved);
    expect(node).toMatchObject({ left: { kind: "custom", name: "Trend" } });
    expect((node as { left: { part?: string } }).left.part).toBeUndefined();
  });
});
