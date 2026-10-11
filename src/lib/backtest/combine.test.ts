import { describe, expect, it } from "vitest";
import { combineEquity, combinedSummary } from "./combine";

const a = { id: "a", name: "A", symbol: "AAA", startingCapital: 1000, equity: [{ time: 1, equity: 1000 }, { time: 3, equity: 1100 }, { time: 5, equity: 1050 }] };
const b = { id: "b", name: "B", symbol: "BBB", startingCapital: 2000, equity: [{ time: 2, equity: 2000 }, { time: 4, equity: 1900 }] };

describe("combineEquity", () => {
  it("adds the strategies' account values over time, carrying each forward", () => {
    expect(combineEquity([a, b])).toEqual([
      { time: 1, equity: 3000 },
      { time: 2, equity: 3000 },
      { time: 3, equity: 3100 },
      { time: 4, equity: 3000 },
      { time: 5, equity: 2950 },
    ]);
  });
  it("counts a strategy at its starting capital before its first point", () => {
    expect(combineEquity([{ ...a, equity: [{ time: 10, equity: 1200 }] }, b])[0]).toEqual({ time: 2, equity: 3000 });
  });
  it("is empty with no runs", () => {
    expect(combineEquity([])).toEqual([]);
  });
});

describe("combinedSummary", () => {
  it("totals capital, return, drawdown and each strategy's part", () => {
    const runs = [
      { ...a, trades: [{ netPnl: 100 }, { netPnl: -50 }] },
      { ...b, trades: [{ netPnl: -100 }] },
    ];
    const s = combinedSummary(runs, combineEquity(runs));
    expect(s).toMatchObject({ startingCapital: 3000, endingCapital: 2950, netPnl: -50, trades: 3 });
    expect(s.totalReturnPct).toBeCloseTo(-1.67, 2);
    expect(s.maxDrawdownPct).toBeCloseTo(((3100 - 2950) / 3100) * 100, 1);
    expect(s.parts.map((p) => p.netPnl)).toEqual([50, -100]);
  });
});
