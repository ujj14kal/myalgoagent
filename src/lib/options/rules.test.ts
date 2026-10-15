import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import type { ConditionNode } from "@/lib/strategy/types";
import { aggregateBars, firstRuleMinute, premiumSeries } from "./rules";
import { simulateDay } from "./backtest-engine";

const IST = 5.5 * 3600;
const DAY = Date.parse("2026-03-10T00:00:00Z") / 1000 - IST; // midnight IST
const bar = (minute: number, close: number, open = close): Candle => ({ time: DAY + minute * 60, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });
const minutes = (from: number, to: number, f: (m: number) => number) => Array.from({ length: to - from + 1 }, (_, i) => bar(from + i, f(from + i)));

// "close is above 105"
const above = (n: number): ConditionNode => ({ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GT", right: { kind: "constant", value: n } });

describe("aggregateBars", () => {
  it("groups 1-minute candles into 5-minute candles on the IST clock", () => {
    const five = aggregateBars(minutes(555, 569, (m) => 100 + (m - 555)), 5);
    expect(five).toHaveLength(3);
    expect(five[0].open).toBe(100);
    expect(five[0].close).toBe(104);
    expect(five[0].high).toBe(104);
    expect(five[1].open).toBe(105);
  });
  it("leaves 1-minute candles as they are", () => {
    const one = minutes(555, 560, (m) => m);
    expect(aggregateBars(one, 1)).toBe(one);
  });
});

describe("premiumSeries", () => {
  it("counts sold legs as received and bought legs as paid, forward-filled", () => {
    const sold = [bar(555, 100), bar(556, 90)];
    const bought = [bar(555, 40), bar(557, 60)];
    const s = premiumSeries([{ side: "SELL", lots: 1, bars: sold }, { side: "BUY", lots: 1, bars: bought }]);
    expect(s.map((c) => c.close)).toEqual([60, 50, 30]);
  });
});

describe("firstRuleMinute", () => {
  const date = "2026-03-10";
  it("acts on the candle after the one whose close fired the rule", () => {
    const c = minutes(555, 600, (m) => 100 + (m - 555) * 0.5); // closes above 105 at minute 565 (close 105.0 is not >), 566 first
    const at = firstRuleMinute(c, above(105), date, 1, 555, 900);
    expect(at).toBe(567);
  });
  it("never acts before the window opens", () => {
    const c = minutes(555, 600, () => 200);
    expect(firstRuleMinute(c, above(105), date, 1, 580, 900)).toBe(580);
  });
  it("returns null when the rule fires only after the latest entry", () => {
    const c = minutes(555, 700, (m) => (m > 650 ? 200 : 100));
    expect(firstRuleMinute(c, above(105), date, 1, 555, 640)).toBeNull();
  });
  it("uses the timeframe: a 5-minute candle is acted on after it closes", () => {
    const c = aggregateBars(minutes(555, 600, (m) => (m >= 570 ? 200 : 100)), 5);
    expect(firstRuleMinute(c, above(105), date, 5, 555, 900)).toBe(575);
  });
});

describe("an exit rule", () => {
  const legs = (px: (m: number) => number) => [{ leg: { type: "CE" as const, side: "SELL" as const, offset: 0, lots: 1 }, symbol: "X", strike: 100, bars: minutes(555, 930, px) }];
  const cfg = { entryMinute: 560, exitMinute: 900, stopLossUnit: null, stopLossValue: null, targetUnit: null, targetValue: null };
  const input = (px: (m: number) => number) => ({ date: "2026-03-10", expiry: "2026-03-12", spot: 100, atm: 100, legs: legs(px) });
  it("closes the trade at that minute, priced at its open, with the reason RULE", () => {
    const t = simulateDay(input(() => 50), cfg, { brokeragePerOrder: 0, slippagePct: 0 }, 1, 700)!;
    expect(t.exitReason).toBe("RULE");
    expect(t.exitMinute).toBe(700);
  });
  it("loses to a stop-loss that came first", () => {
    const px = (m: number) => (m >= 600 ? 80 : 50);
    const t = simulateDay(input(px), { ...cfg, stopLossUnit: "RUPEES" as const, stopLossValue: 10 }, { brokeragePerOrder: 0, slippagePct: 0 }, 1, 700)!;
    expect(t.exitReason).toBe("STOP_LOSS");
  });
  it("is ignored when it falls after the square-off", () => {
    const t = simulateDay(input(() => 50), cfg, { brokeragePerOrder: 0, slippagePct: 0 }, 1, 950)!;
    expect(t.exitReason).toBe("TIME");
  });
});

describe("a trailing stop", () => {
  const base = { entryMinute: 560, exitMinute: 900, stopLossUnit: null, stopLossValue: null, targetUnit: null, targetValue: null };
  const costs = { brokeragePerOrder: 0, slippagePct: 0 };
  // A sold option: the premium falls (profit), then climbs back (profit shrinks).
  const bars = (px: (m: number) => number) => [{ leg: { type: "CE" as const, side: "SELL" as const, offset: 0, lots: 1 }, symbol: "X", strike: 100, bars: minutes(555, 930, px) }];
  const input = (px: (m: number) => number) => ({ date: "2026-03-10", expiry: "2026-03-12", spot: 100, atm: 100, legs: bars(px) });
  const px = (m: number) => (m < 600 ? 100 : m < 700 ? 100 - (m - 600) * 0.2 : 80 + (m - 700) * 0.2);
  it("leaves when the profit has fallen the set amount from its best", () => {
    const t = simulateDay(input(px), { ...base, trailUnit: "RUPEES" as const, trailValue: 5 }, costs, 1)!;
    expect(t.exitReason).toBe("TRAILING_STOP");
    expect(t.peak).toBeGreaterThan(15);
    expect(t.grossPnl).toBeGreaterThan(10); // it kept most of the gain a plain time exit would have given back
  });
  it("is just a stop-loss until there is a profit", () => {
    const t = simulateDay(input((m) => 100 + (m - 560) * 0.1), { ...base, trailUnit: "RUPEES" as const, trailValue: 3 }, costs, 1)!;
    expect(t.exitReason).toBe("TRAILING_STOP");
    expect(t.grossPnl).toBeLessThan(0);
  });
  it("does nothing when not set", () => {
    expect(simulateDay(input(px), base, costs, 1)!.exitReason).toBe("TIME");
  });
});
