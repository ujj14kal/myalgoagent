import { describe, expect, it } from "vitest";
import type { ConditionNode } from "@/lib/strategy/types";
import { blockDemo, conceptDemo, indicatorDemo, singleChart } from "./proposal-demo";

const above20: ConditionNode = { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "CROSSES_ABOVE", right: { kind: "indicator", type: "SMA", params: [20] } };

describe("blockDemo", () => {
  it("shows the block turning on a few times on the ₹1,000 dummy stock", () => {
    const d = blockDemo("Close crosses above 20 SMA", above20);
    expect(d.candles[0].open).toBe(1000);
    expect(d.hits).toBeGreaterThanOrEqual(2);
    expect(d.notes.filter((n) => n.text === "Present")).toHaveLength(d.hits);
    expect(d.lines.join(" ")).toMatch(/made-up stock/);
    expect(d.lines.join(" ")).toMatch(/present when/i);
  });
  it("ignores other charts and other stocks, since the demo has one", () => {
    const other: ConditionNode = { kind: "comparison", left: { kind: "price", field: "CLOSE", timeframe: "1wk", instrumentSymbol: "TCS.NS" }, operator: "GT", right: { kind: "constant", value: 1 } };
    const cleaned = singleChart(other);
    expect(cleaned.kind === "comparison" && cleaned.left.kind === "price" && cleaned.left.timeframe).toBeUndefined();
    expect(() => blockDemo("x", other)).not.toThrow();
  });
});

describe("indicatorDemo", () => {
  it("draws a price-pane formula as an overlay", () => {
    const d = indicatorDemo("Mid", { type: "formula", formula: "(highest(high, 20) + lowest(low, 20)) / 2", pane: "price" });
    expect(d.overlays).toHaveLength(1);
    expect(d.lower).toHaveLength(0);
    expect(d.overlays[0].points.length).toBeGreaterThan(50);
  });
  it("draws a separate-pane formula under the chart", () => {
    const d = indicatorDemo("Strength", { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" });
    expect(d.lower).toHaveLength(1);
    expect(d.overlays).toHaveLength(0);
  });
  it("marks where a signal indicator is on", () => {
    const d = indicatorDemo("Up", { type: "signal", formula: "close > sma(close, 20)" });
    expect(d.hits).toBeGreaterThan(0);
    expect(d.notes[0].text).toBe("Signal");
  });
});

describe("conceptDemo", () => {
  it("labels each block's appearances and marks when the setup is valid", () => {
    const d = conceptDemo("Setup", above20, [{ name: "Cross", condition: above20 }]);
    expect(d.notes.some((n) => n.text === "Cross")).toBe(true);
    expect(d.notes.some((n) => n.text === "Setup valid")).toBe(d.hits > 0);
  });
});
