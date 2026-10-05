import { describe, expect, it } from "vitest";
import { classifyCustom, CUSTOM_CLASSES, CLASS_ABOUT } from "./index";

describe("classifyCustom", () => {
  it("tells formulas apart by where they draw", () => {
    expect(classifyCustom({ type: "formula", formula: "sma(close, 20)", pane: "price" })).toBe("Price overlay");
    expect(classifyCustom({ type: "formula", formula: "rsi(close, 14)", pane: "separate" })).toBe("Graph line");
    expect(classifyCustom({ type: "signal", formula: "crossover(ema(close, 20), ema(close, 50))" })).toBe("Signal markers");
  });
  it("tells a sloped line from a flat level, and a drawn channel from both", () => {
    expect(classifyCustom({ type: "line", points: [{ time: 1, price: 100 }, { time: 2, price: 110 }] })).toBe("Trend line");
    expect(classifyCustom({ type: "line", points: [{ time: 1, price: 100 }, { time: 2, price: 100 }] })).toBe("Horizontal level");
    expect(classifyCustom({ type: "line", points: [{ time: 1, price: 100 }, { time: 2, price: 110 }], offset: 5 })).toBe("Channel");
    expect(classifyCustom({ type: "level", price: 100 })).toBe("Horizontal level");
  });
  it("tells a zone from a rectangle by its end date", () => {
    expect(classifyCustom({ type: "zone", upper: 110, lower: 100 })).toBe("Zone");
    expect(classifyCustom({ type: "zone", upper: 110, lower: 100, from: 1, to: 2 })).toBe("Rectangle");
    expect(classifyCustom({ type: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)" })).toBe("Channel");
    expect(classifyCustom({ type: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)" })).toBe("Band");
  });
  it("explains every class", () => {
    for (const c of CUSTOM_CLASSES) expect(CLASS_ABOUT[c].length).toBeGreaterThan(10);
  });
});
