import { describe, expect, it } from "vitest";
import { analyze, MIN_CANDLES } from "./analyze";
import type { Candle } from "@/lib/market-data";

function series(n: number, step: (i: number) => number): Candle[] {
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = p;
    p = Math.max(1, p + step(i));
    return { time: 1_700_000_000 + i * 86400, open, high: Math.max(open, p) + 0.5, low: Math.min(open, p) - 0.5, close: p, volume: 1000 + i };
  });
}

describe("analyze", () => {
  it("needs enough history", () => expect(analyze(series(MIN_CANDLES - 1, () => 1))).toBeNull());
  it("reads a steady rise as up", () => {
    const a = analyze(series(260, () => 0.6))!;
    expect(a.upPct).toBeGreaterThan(a.downPct);
    expect(["Mostly up", "Leaning up"]).toContain(a.verdict);
  });
  it("reads a steady fall as down", () => {
    const a = analyze(series(260, () => -0.3))!;
    expect(a.downPct).toBeGreaterThan(a.upPct);
  });
  it("percentages always add to 100 and every factor explains itself", () => {
    const a = analyze(series(120, (i) => Math.sin(i / 4)))!;
    expect(a.upPct + a.downPct + a.neutralPct).toBe(100);
    expect(a.factors.every((f) => f.reading.length > 10 && f.weight > 0)).toBe(true);
  });
});
