import { describe, expect, it } from "vitest";
import { computeCustomSeries, validateCustomDef } from "./index";
import { evaluateStrategy } from "@/lib/strategy/evaluate";
import { validateConditionNode } from "@/lib/strategy/validate";

const candles = Array.from({ length: 30 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 }));

describe("drawn lines", () => {
  it("extend through both points but only exist from the later one (no look-ahead)", () => {
    const def = { type: "line" as const, points: [{ time: candles[5].time, price: 105 }, { time: candles[10].time, price: 110 }] as [{ time: number; price: number }, { time: number; price: number }] };
    const v = computeCustomSeries(candles, def);
    expect(v[9]).toBeNaN();
    expect(v[10]).toBeCloseTo(110);
    expect(v[20]).toBeCloseTo(120);
  });
  it("validates definitions", () => {
    expect(() => validateCustomDef({ type: "line", points: [{ time: 1, price: 1 }] })).toThrow(/two points/);
    expect(() => validateCustomDef({ type: "formula", formula: "sma(close)", pane: "separate" })).toThrow(/source and a length/);
    expect(validateCustomDef({ type: "formula", formula: " close ", pane: "price" })).toEqual({ type: "formula", formula: "close", pane: "price" });
  });
});

describe("custom operands in rules", () => {
  it("evaluate like any indicator and pass validation", () => {
    const entry = {
      kind: "comparison" as const,
      left: { kind: "custom" as const, name: "Momentum", def: { type: "formula" as const, formula: "change(close, 3)", pane: "separate" as const } },
      operator: "GT" as const,
      right: { kind: "constant" as const, value: 2 },
    };
    expect(() => validateConditionNode(entry)).not.toThrow();
    const never = { kind: "comparison" as const, left: { kind: "constant" as const, value: 0 }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };
    const signals = evaluateStrategy(candles, entry, never);
    expect(signals.find((s) => s.type === "entry")?.time).toBe(candles[3].time);
  });
});
