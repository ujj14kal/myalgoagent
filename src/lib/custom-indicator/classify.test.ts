import { describe, expect, it } from "vitest";
import { classifyCustom } from "./index";

describe("classifyCustom", () => {
  it("tells formulas apart by where they draw", () => {
    expect(classifyCustom({ type: "formula", formula: "sma(close, 20)", pane: "price" })).toBe("Overlay on price");
    expect(classifyCustom({ type: "formula", formula: "rsi(close, 14)", pane: "separate" })).toBe("Own-pane indicator");
  });
  it("tells a sloped line from a flat level", () => {
    expect(classifyCustom({ type: "line", points: [{ time: 1, price: 100 }, { time: 2, price: 110 }] })).toBe("Trendline");
    expect(classifyCustom({ type: "line", points: [{ time: 1, price: 100 }, { time: 2, price: 100 }] })).toBe("Horizontal level");
  });
});
