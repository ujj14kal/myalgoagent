import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { parseDsl } from "@/lib/strategy/dsl";
import { runBacktest } from "./run";
import type { EntryPlan, TargetLevel } from "@/lib/trading-engine/step";

// A position built or sold in stages is ONE trade in a backtest, so win rate, profit factor and the trade list count
// positions rather than pieces. Its parts are kept on the trade.

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: 1000 });
const entry = parseDsl("close crossesAbove 100.5");
const never = parseDsl("close < 1");
const base = { startingCapital: 1_000_000, brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY" as const, value: 100 } };
const targets: TargetLevel[] = [
  { unit: "PERCENT", value: 5, exitPercent: 25, lock: { mode: "FIXED" } },
  { unit: "PERCENT", value: 10, exitPercent: 25, lock: { mode: "FIXED" } },
];

describe("staged sales are one trade", () => {
  // Signal on bar 1 (close 101 crosses above 100.5) → entry at bar 2's open (101).
  const candles = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 101.5, 100, 101),
    bar(2, 101, 102, 100.5, 101),
    bar(3, 102, 107, 102, 106), // Target 1 at 101 × 1.05 = 106.05 → 25 shares
    bar(4, 107, 112, 106.5, 111), // Target 2 at 111.1 → no (high 112 ≥ 111.1) → 25 shares
    bar(5, 111, 111, 108, 109),
    bar(6, 109, 109, 109, 109),
  ];
  const result = runBacktest(candles, entry, never, { ...base, riskManagement: { stopLoss: null, target: null, trailingSl: null, targets } });

  it("reports the position once, with total shares and the summed P&L", () => {
    expect(result.trades).toHaveLength(1);
    const t = result.trades[0];
    expect(t.quantity).toBe(100);
    expect(t.entryPrice).toBe(101);
    // 25 × (106.05 − 101) + 25 × (111.1 − 101), and the other 50 sold when price fell back to the 111.1 lock
    expect(t.netPnl).toBeCloseTo(25 * 5.05 + 25 * 10.1 + 50 * 10.1, 6);
    expect(t.exitReason).toBe("locked_profit");
    expect(result.metrics.tradeCount).toBe(1);
  });

  it("keeps the parts", () => {
    const legs = result.trades[0].legs!;
    expect(legs.exits.map((e) => [e.reason, e.targetLevel, e.quantity])).toEqual([["target", 1, 25], ["target", 2, 25], ["locked_profit", undefined, 50]]);
    expect(legs.entries).toEqual([]);
  });

  it("a plain trade has no legs and is unchanged", () => {
    const plain = runBacktest(candles, entry, never, base);
    expect(plain.trades).toHaveLength(1);
    expect(plain.trades[0].legs).toBeUndefined();
  });
});

describe("entry levels are one trade", () => {
  const plan: EntryPlan = { firstPercent: 50, levels: [{ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 50 }] };
  const candles = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 101.5, 100, 101),
    bar(2, 101, 102, 100.5, 101), // entry: 50 @ 101
    bar(3, 101, 101, 97.5, 98), // level at 101 × 0.97 = 97.97: +50 @ 97.97
    bar(4, 98, 105, 98, 104),
    bar(5, 104, 104, 104, 104),
  ];
  it("one trade for the whole position, with each entry kept", () => {
    const r = runBacktest(candles, entry, never, { ...base, entryPlan: plan });
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.quantity).toBe(100);
    expect(t.legs!.entries).toEqual([{ level: 2, time: candles[3].time, price: 101 * 0.97, quantity: 50 }]);
    expect(t.netPnl).toBeCloseTo(100 * (104 - (101 + 97.97) / 2), 4);
  });
});

describe("a rule-triggered entry level", () => {
  const plan: EntryPlan = { firstPercent: 50, levels: [{ trigger: "SIGNAL", unit: "PERCENT", value: 0, allocationPercent: 50, condition: parseDsl("close < 99") }] };
  const candles = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 101.5, 100, 101),
    bar(2, 101, 102, 100.5, 101), // entry: 50 @ 101
    bar(3, 101, 101, 98.5, 98.8), // close 98.8 < 99: the rule holds at this close …
    bar(4, 98.9, 100, 98.9, 100), // … so 50 more are bought at THIS open (98.9)
    bar(5, 100, 104, 100, 104),
    bar(6, 104, 104, 104, 104),
  ];
  it("buys at the next open after the rule holds, never on the same candle", () => {
    const r = runBacktest(candles, entry, never, { ...base, entryPlan: plan });
    const t = r.trades[0];
    expect(t.quantity).toBe(100);
    expect(t.legs!.entries).toEqual([{ level: 2, time: candles[4].time, price: 98.9, quantity: 50 }]);
  });
  it("does not buy if the rule never holds", () => {
    const flat = candles.map((c) => ({ ...c, low: Math.max(c.low, 99.5), close: Math.max(c.close, 99.5), open: Math.max(c.open, 99.5) }));
    const r = runBacktest(flat, entry, never, { ...base, entryPlan: plan });
    expect(r.trades[0].quantity).toBe(50);
    expect(r.trades[0].legs).toBeUndefined();
  });
});

describe("a level that waited too long no longer blocks the ones after it", () => {
  const plan: EntryPlan = {
    firstPercent: 50,
    levels: [
      { trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 25, maxWaitDays: 1 },
      { trigger: "PULLBACK", unit: "PERCENT", value: 6, allocationPercent: 25 },
    ],
  };
  const candles = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 101.5, 100, 101),
    bar(2, 101, 102, 100.5, 101), // entry: 50 @ 101
    bar(3, 101, 101.5, 100.5, 101),
    bar(4, 101, 101.5, 100.5, 101),
    bar(5, 101, 101.5, 100.5, 101), // level 2 has now waited more than a day and is dropped
    bar(6, 100, 100, 94, 95), // 101 × 0.94 = 94.94: level 3 fills although level 2 never did
    bar(7, 95, 95, 95, 95),
  ];
  it("fills the later level", () => {
    const r = runBacktest(candles, entry, never, { ...base, entryPlan: plan });
    expect(r.trades[0].quantity).toBe(75);
    expect(r.trades[0].legs!.entries.map((e) => e.level)).toEqual([3]);
  });
});
