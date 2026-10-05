import { describe, expect, it } from "vitest";
import { computeCustomSeries, customParts, customVisual, defaultPart, describeCustom, validateCustomDef, type CustomIndicatorDef } from "./index";
import { evaluateStrategy } from "@/lib/strategy/evaluate";
import { validateConditionNode } from "@/lib/strategy/validate";
import { conditionToText } from "@/lib/strategy/format";

// Close climbs 100, 101, … 129; high = close + 1, low = close − 1.
const candles = Array.from({ length: 30 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 }));
const T = (i: number) => candles[i].time;
const never = { kind: "comparison" as const, left: { kind: "constant" as const, value: 0 }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };

describe("levels and zones", () => {
  it("a level holds its price, only from its start when it has one", () => {
    expect(computeCustomSeries(candles, { type: "level", price: 110 })[0]).toBe(110);
    const v = computeCustomSeries(candles, { type: "level", price: 110, from: T(5) });
    expect(v[4]).toBeNaN();
    expect(v[5]).toBe(110);
  });
  it("a zone has upper, middle, lower and inside", () => {
    const zone: CustomIndicatorDef = { type: "zone", upper: 115, lower: 105 };
    expect(customParts(zone)).toEqual(["upper", "middle", "lower", "inside"]);
    expect(defaultPart(zone)).toBe("middle");
    expect(computeCustomSeries(candles, zone, "upper")[0]).toBe(115);
    expect(computeCustomSeries(candles, zone, "middle")[0]).toBe(110);
    const inside = computeCustomSeries(candles, zone, "inside");
    expect(inside.slice(3, 17)).toEqual([0, 0, ...Array(11).fill(1), 0]);
  });
  it("a rectangle only exists between its edges", () => {
    const rect: CustomIndicatorDef = { type: "zone", upper: 200, lower: 50, from: T(10), to: T(12) };
    const inside = computeCustomSeries(candles, rect, "inside");
    expect(inside[9]).toBeNaN();
    expect(inside.slice(10, 13)).toEqual([1, 1, 1]);
    expect(inside[13]).toBeNaN();
  });
});

describe("channels and bands", () => {
  it("a formula channel reads both lines, with a halfway middle by default", () => {
    const ch: CustomIndicatorDef = { type: "channel", upper: "highest(high, 3)", lower: "lowest(low, 3)" };
    expect(computeCustomSeries(candles, ch, "upper")[5]).toBe(106);
    expect(computeCustomSeries(candles, ch, "lower")[5]).toBe(102);
    expect(computeCustomSeries(candles, ch, "middle")[5]).toBe(104);
    expect(computeCustomSeries(candles, ch, "inside")[5]).toBe(1);
  });
  it("a band is middle ± width", () => {
    const band: CustomIndicatorDef = { type: "band", middle: "close", width: "2" };
    expect(computeCustomSeries(candles, band, "upper")[4]).toBe(106);
    expect(computeCustomSeries(candles, band, "lower")[4]).toBe(102);
  });
  it("a drawn channel adds a parallel line and still never looks ahead", () => {
    const ch: CustomIndicatorDef = { type: "line", points: [{ time: T(5), price: 105 }, { time: T(10), price: 110 }], offset: -4 };
    expect(computeCustomSeries(candles, ch, "upper")[9]).toBeNaN();
    expect(computeCustomSeries(candles, ch, "upper")[10]).toBeCloseTo(110);
    expect(computeCustomSeries(candles, ch, "lower")[10]).toBeCloseTo(106);
  });
  it("refuses a part a single-line indicator doesn't have", () => {
    expect(() => computeCustomSeries(candles, { type: "level", price: 100 }, "upper")).toThrow(/no upper/);
  });
});

describe("signal markers", () => {
  it("read 1 where true, 0 otherwise, and mark the first bar of each run", () => {
    const sig: CustomIndicatorDef = { type: "signal", formula: "close > 110 and close < 113 or close == 120" };
    const v = computeCustomSeries(candles, sig);
    expect(v.slice(10, 14)).toEqual([0, 1, 1, 0]);
    expect(customVisual(candles, sig, "S").markers).toEqual([T(11), T(20)]);
  });
});

describe("validation", () => {
  it("cleans and checks every kind", () => {
    expect(validateCustomDef({ type: "zone", upper: 100, lower: 110, color: "#ABCDEF" })).toEqual({ type: "zone", upper: 110, lower: 100, color: "#abcdef" });
    expect(() => validateCustomDef({ type: "zone", upper: 100, lower: 100 })).toThrow(/two different prices/);
    expect(() => validateCustomDef({ type: "zone", upper: 110, lower: 100, to: 5 })).toThrow(/start date/);
    expect(() => validateCustomDef({ type: "zone", upper: 110, lower: 100, from: 9, to: 5 })).toThrow(/after its start/);
    expect(() => validateCustomDef({ type: "level", price: -1 })).toThrow(/above 0/);
    expect(() => validateCustomDef({ type: "band", middle: "sma(close, 20)", width: "stdev(close)" })).toThrow(/^Width:/);
    expect(() => validateCustomDef({ type: "channel", upper: "highest(high, 20)" })).toThrow(/lower line/);
    expect(validateCustomDef({ type: "level", price: 100, color: "red" })).toEqual({ type: "level", price: 100 });
  });
  it("describes every kind in one line", () => {
    expect(describeCustom({ type: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)" })).toBe("band: sma(close, 20) ± 2 * stdev(close, 20)");
    expect(describeCustom({ type: "zone", upper: 110, lower: 100 })).toBe("zone ₹100–₹110");
    expect(describeCustom({ type: "signal", formula: "close > open" })).toBe("marker where close > open");
  });
});

describe("parts in rules", () => {
  const zone: CustomIndicatorDef = { type: "zone", upper: 115, lower: 105 };
  it("a rule reads the part it names", () => {
    const entry = { kind: "comparison" as const, left: { kind: "custom" as const, name: "Demand", def: zone, part: "inside" as const }, operator: "EQ" as const, right: { kind: "constant" as const, value: 1 } };
    expect(() => validateConditionNode(entry)).not.toThrow();
    expect(evaluateStrategy(candles, entry, never).find((s) => s.type === "entry")?.time).toBe(T(5));
    const above = { kind: "comparison" as const, left: { kind: "price" as const, field: "CLOSE" as const }, operator: "CROSSES_ABOVE" as const, right: { kind: "custom" as const, name: "Demand", def: zone, part: "upper" as const } };
    expect(evaluateStrategy(candles, above, never).find((s) => s.type === "entry")?.time).toBe(T(16));
    expect(conditionToText(above)).toContain("upper line");
  });
  it("validation refuses a part the indicator doesn't have", () => {
    const bad = { kind: "comparison" as const, left: { kind: "custom" as const, name: "L", def: { type: "level" as const, price: 100 }, part: "upper" as const }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };
    expect(() => validateConditionNode(bad)).toThrow(/can be read as value/);
  });
});
