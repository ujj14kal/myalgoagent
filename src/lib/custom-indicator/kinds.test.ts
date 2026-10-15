import { describe, expect, it } from "vitest";
import { computeCustomSeries, customParts, customVisual, defaultPart, describeCustom, indicatorRefs, indicatorSlug, validateCustomDef, type CustomIndicatorDef } from "./index";
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

describe("histogram style and extra output lines", () => {
  const cs = Array.from({ length: 80 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 100 + i * 0.1, high: 102 + i * 0.1, low: 98 + i * 0.1, close: 100 + Math.sin(i / 5) * 3 + i * 0.1, volume: 1000 }));
  it("keeps the histogram style for a graph line only", () => {
    expect(validateCustomDef({ type: "formula", formula: "close - sma(close, 5)", pane: "separate", style: "histogram" })).toMatchObject({ style: "histogram" });
    expect(validateCustomDef({ type: "formula", formula: "close", pane: "price", style: "histogram" })).not.toHaveProperty("style");
    const v = customVisual(cs, { type: "formula", formula: "close - sma(close, 5)", pane: "separate", style: "histogram" }, "Bars");
    expect(v.lines[0].type).toBe("histogram");
  });
  it("draws steps named plot_… as extra lines beside the main one", () => {
    const v = customVisual(cs, { type: "formula", formula: "plot_fast = ema(close, 5)\nplot_slow = ema(close, 20)\nplot_fast - plot_slow", pane: "separate" }, "Spread");
    expect(v.lines.map((l) => l.label)).toEqual(["Spread", "Spread · fast", "Spread · slow"]);
    expect(v.lines[1].points.length).toBeGreaterThan(0);
  });
});

describe("indicators built on other indicators", () => {
  const cs = Array.from({ length: 90 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 100 + i * 0.1, high: 102 + i * 0.1, low: 98 + i * 0.1, close: 100 + Math.sin(i / 5) * 3 + i * 0.1, volume: 1000 }));
  const base: CustomIndicatorDef = { type: "formula", formula: "(close - sma(close, 20)) / atr(14)", pane: "separate" };
  const top: CustomIndicatorDef = { type: "formula", formula: "ind(trend_score) * 2 + 1", pane: "separate", uses: { trend_score: base } };

  it("reads the other indicator's values", () => {
    const own = computeCustomSeries(cs, base);
    const v = computeCustomSeries(cs, top);
    expect(v[60]).toBeCloseTo(own[60] * 2 + 1);
  });
  it("names the indicators a formula reads and makes a readable slug", () => {
    expect(indicatorRefs(top)).toEqual(["trend_score"]);
    expect(indicatorSlug("Trend score (v2)")).toBe("trend_score_v2");
  });
  it("refuses a link that isn't attached, with a plain message", () => {
    expect(() => validateCustomDef({ type: "formula", formula: "ind(missing) + 1", pane: "separate" })).toThrow(/no custom indicator of yours called/);
    expect(() => validateCustomDef({ ...top, formula: "ind(another)" })).toThrow(/no custom indicator of yours called/);
  });
  it("keeps the attached copy through validation, so a later edit of the other one changes nothing", () => {
    const clean = validateCustomDef(top);
    expect(clean.uses?.trend_score).toMatchObject({ type: "formula" });
    expect(computeCustomSeries(cs, clean)[60]).toBeCloseTo(computeCustomSeries(cs, top)[60]);
  });
  it("limits how deep the chain can go", () => {
    let d: CustomIndicatorDef = base;
    for (let i = 0; i < 4; i++) d = { type: "formula", formula: "ind(a) + 1", pane: "separate", uses: { a: d } };
    expect(() => validateCustomDef(d)).toThrow(/levels deep/);
  });
  it("never repaints", () => {
    const full = computeCustomSeries(cs, top);
    const part = computeCustomSeries(cs.slice(0, 70), top);
    for (let i = 0; i < 70; i++) {
      if (Number.isNaN(full[i])) expect(part[i]).toBeNaN();
      else expect(part[i]).toBeCloseTo(full[i], 9);
    }
  });
});
