import { describe, expect, it } from "vitest";
import { syncPaperSession, type PaperSessionState } from "@/lib/paper/sync";
import type { ConditionNode } from "@/lib/strategy/types";
import { resyncEntryPlan } from "./resync";
import { entryPlanToStore, parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import { styleProblem } from "@/lib/strategy/style";

// A multi-level entry plan across restarts, with the same state hand-off a live deployment uses:
// an entry level that already filled must never be bought again, and a restart must not forget how far the plan got.

const DAY = "2026-10-05"; // a Monday
const istSec = (hhmm: string) => Math.floor(new Date(`${DAY}T${hhmm}:00+05:30`).getTime() / 1000);
/** Flat at 300 until 11:10, then falling 0.15 a minute. */
const minutes = () => {
  const out = [];
  for (let t = istSec("09:15"); t <= istSec("15:30"); t += 60) {
    const since = Math.max(0, (t - istSec("11:10")) / 60);
    const px = 300 - 0.15 * since;
    out.push({ time: t, open: px, high: px + 0.02, low: px - 0.02, close: px, volume: 100 });
  }
  return out;
};
const win = (start: number, end: number): ConditionNode => ({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: start, endMinute: end } });
const state = (over: Record<string, unknown> = {}): PaperSessionState =>
  ({
    instrumentSymbol: "TARIL.NS",
    direction: "LONG",
    entryCondition: win(11 * 60 + 3, 11 * 60 + 4),
    exitCondition: win(15 * 60, 15 * 60 + 30),
    brokeragePercent: 0,
    slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 100 },
    riskManagement: { stopLoss: null, target: null, trailingSl: null },
    entryPlan: { firstPercent: 25, levels: [{ trigger: "PULLBACK", unit: "PERCENT", value: 0.5, allocationPercent: 25 }, { trigger: "PULLBACK", unit: "PERCENT", value: 1, allocationPercent: 25 }] },
    maxPyramidEntries: 1,
    timeframe: "1m",
    noEntryAfterMinute: 14 * 60 + 30,
    squareOffMinute: 15 * 60 + 15,
    productType: "INTRADAY",
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
    cash: 1_000_000,
    positionEntryTime: null,
    positionEntryPrice: null,
    positionQuantity: null,
    positionFavorableExtreme: null,
    positionStopLossPrice: null,
    positionTargetPrice: null,
    positionPyramidCount: null,
    positionPlannedQuantity: null,
    positionAnchorPrice: null,
    lastSyncedTime: istSec("11:00"),
    ...over,
  }) as unknown as PaperSessionState;

async function pass(s: PaperSessionState, at: string) {
  const all = minutes();
  const nowSec = istSec(at) + 20;
  const market = { name: "t", isOfficial: false, depth: "standard" as const, getHistoricalCandles: async () => all.filter((c) => c.time <= nowSec) };
  const realNow = Date.now;
  Date.now = () => nowSec * 1000;
  try {
    return await syncPaperSession(s, true, market, { includeForming: true });
  } finally {
    Date.now = realNow;
  }
}
const saved = (s: PaperSessionState, r: Awaited<ReturnType<typeof pass>>): PaperSessionState =>
  ({
    ...s,
    cash: r.cash,
    positionEntryTime: r.position?.entryTime ?? null,
    positionEntryPrice: r.position?.entryPrice ?? null,
    positionQuantity: r.position?.quantity ?? null,
    positionFavorableExtreme: r.position?.favorableExtreme ?? null,
    positionStopLossPrice: r.position?.stopLossPrice ?? null,
    positionTargetPrice: r.position?.targetPrice ?? null,
    positionPyramidCount: r.position?.pyramidCount ?? null,
    positionPlannedQuantity: r.position?.plannedQuantity ?? null,
    positionAnchorPrice: r.position?.anchorPrice ?? null,
    lastSyncedTime: r.lastSyncedTime,
  }) as PaperSessionState;

describe("a multi-level entry plan across restarts", () => {
  it("buys its first share on the signal and keeps the rest of the plan for later", async () => {
    const r = await pass(state(), "11:08");
    expect(r.newOrders.map((o) => [o.reason, o.quantity])).toEqual([["entry_rule", 25]]);
    expect(r.position?.plannedQuantity).toBe(100);
  });

  it("buys each further share once, and a restart never buys it again", async () => {
    const s0 = state();
    const s1 = saved(s0, await pass(s0, "11:08"));
    const second = await pass(s1, "11:25"); // price is down more than 0.5%
    expect(second.newOrders.map((o) => [o.reason, o.entryLevel, o.quantity, o.side])).toEqual([["entry_level", 2, 25, "BUY"]]);
    expect(second.position?.quantity).toBe(50);
    expect(second.position?.pyramidCount).toBe(2);

    const s2 = saved(s1, second);
    const restarted = await pass(s2, "11:25"); // same moment, from the saved state
    expect(restarted.newOrders).toHaveLength(0);
    expect(restarted.position?.quantity).toBe(50);

    const third = await pass(s2, "11:45"); // price is down more than 1%
    expect(third.newOrders.map((o) => [o.reason, o.entryLevel, o.quantity])).toEqual([["entry_level", 3, 25]]);
    expect(third.position?.quantity).toBe(75);
  });
});

describe("resyncEntryPlan (after a refused or lost entry)", () => {
  const held = (over: Record<string, unknown>) => state({ positionEntryPrice: 299, positionQuantity: 75, positionPlannedQuantity: 100, positionAnchorPrice: 300, positionPyramidCount: 3, ...over });

  it("does nothing when the engine and the broker agree", () => {
    const s = held({});
    expect(resyncEntryPlan(s, { qty: 75, avg: 299 })).toBe(s);
  });
  it("steps the plan back when the broker holds less than the engine believes", () => {
    const r = resyncEntryPlan(held({}), { qty: 50, avg: 298.5 });
    expect(r.positionPyramidCount).toBe(2);
    expect(r.positionQuantity).toBe(50);
    expect(r.positionEntryPrice).toBe(298.5);
  });
  it("goes back to the first entry when only that filled", () => {
    expect(resyncEntryPlan(held({}), { qty: 25, avg: 300 }).positionPyramidCount).toBe(1);
  });
  it("leaves the plan alone once a target has been taken (nothing more is bought then)", () => {
    const s = held({ positionTargetsHit: 1 });
    expect(resyncEntryPlan(s, { qty: 50, avg: 298 })).toBe(s);
  });
  it("leaves strategies without a plan alone", () => {
    const s = held({ entryPlan: null });
    expect(resyncEntryPlan(s, { qty: 50, avg: 298 })).toBe(s);
  });
});

describe("storing an entry plan", () => {
  it("stores nothing for a plain single entry", () => {
    expect(entryPlanToStore({ firstPercent: 100, levels: [] }, 1).json).toBeNull();
    expect(entryPlanToStore(undefined, 1).json).toBeNull();
  });
  it("stores a valid plan and rejects an invalid one with the reason", () => {
    const ok = entryPlanToStore({ firstPercent: 25, levels: [{ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 25 }], maxHoldDays: 30 }, 1);
    expect(ok.json?.levels).toHaveLength(1);
    expect(ok.json?.maxHoldDays).toBe(30);
    expect(entryPlanToStore({ firstPercent: 60, levels: [{ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 60 }] }, 1).error).toMatch(/100%/);
  });
  it("a holding limit alone is a valid plan", () => {
    expect(entryPlanToStore({ firstPercent: 100, levels: [], maxHoldDays: 20 }, 1).json).toEqual({ firstPercent: 100, levels: [], maxHoldDays: 20 });
  });
  it("reads malformed JSON defensively", () => {
    expect(parseEntryPlan(null)).toBeUndefined();
    expect(parseEntryPlan({ firstPercent: 25, levels: [{ trigger: "SIDEWAYS", unit: "PERCENT", value: 3, allocationPercent: 25 }, "x"] })?.levels).toEqual([]);
  });
});

describe("swing and positional styles", () => {
  const ok = { timeframe: "1d", productType: "DELIVERY", direction: "LONG" };
  it("accept daily, delivery, long", () => {
    expect(styleProblem("SWING", ok)).toBeNull();
    expect(styleProblem("POSITIONAL", ok)).toBeNull();
    expect(styleProblem("INTRADAY", { timeframe: "5m", productType: "INTRADAY", direction: "SHORT" })).toBeNull();
    expect(styleProblem(null, { timeframe: "5m", productType: "INTRADAY", direction: "SHORT" })).toBeNull();
  });
  it("explain what is wrong", () => {
    expect(styleProblem("SWING", { ...ok, timeframe: "15m" })).toMatch(/daily candles/);
    expect(styleProblem("SWING", { ...ok, productType: "INTRADAY" })).toMatch(/delivery/);
    expect(styleProblem("POSITIONAL", { ...ok, direction: "SHORT" })).toMatch(/long only/);
  });
});

describe("a rule-triggered entry across restarts", () => {
  const signalPlan = { firstPercent: 50, levels: [{ trigger: "SIGNAL", unit: "PERCENT", value: 0, allocationPercent: 50, condition: { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "LT", right: { kind: "constant", value: 299 } } }] };

  it("buys when its rule holds, once, and a restart does not buy it again", async () => {
    const s0 = state({ entryPlan: signalPlan });
    const s1 = saved(s0, await pass(s0, "11:08"));
    expect(s1.positionQuantity).toBe(50);
    const bought = await pass(s1, "11:25"); // price has fallen below 299: the rule holds
    expect(bought.newOrders.map((o) => [o.reason, o.entryLevel, o.quantity])).toEqual([["entry_level", 2, 50]]);
    expect(bought.position?.quantity).toBe(100);
    const s2 = saved(s1, bought);
    const again = await pass(s2, "11:25");
    expect(again.newOrders).toHaveLength(0);
    const later = await pass(s2, "11:50");
    expect(later.newOrders).toHaveLength(0);
    expect(later.position?.quantity).toBe(100);
  });
  it("buys nothing while its rule does not hold", async () => {
    const s0 = state({ entryPlan: signalPlan });
    const s1 = saved(s0, await pass(s0, "11:08"));
    const early = await pass(s1, "11:12"); // price is still above 299
    expect(early.newOrders).toHaveLength(0);
  });
});
