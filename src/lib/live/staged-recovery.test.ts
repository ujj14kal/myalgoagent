import { describe, expect, it } from "vitest";
import { syncPaperSession, type PaperSessionState } from "@/lib/paper/sync";
import type { ConditionNode } from "@/lib/strategy/types";
import { resyncStaged } from "./resync";

// Staged targets (Target 1–3) across restarts, with the same state hand-off a live deployment uses:
// a target already taken must never be sold twice, and a restart must not forget the stop it set.

const DAY = "2026-10-05"; // a Monday
const istSec = (hhmm: string) => Math.floor(new Date(`${DAY}T${hhmm}:00+05:30`).getTime() / 1000);
const minutes = (from: string, to: string) => {
  const out = [];
  for (let t = istSec(from), px = 295; t <= istSec(to); t += 60, px += 0.1) out.push({ time: t, open: px, high: px + 0.05, low: px - 0.05, close: px + 0.05, volume: 100 });
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
    riskManagement: {
      stopLoss: null,
      target: null,
      trailingSl: null,
      targets: [
        { unit: "POINTS", value: 1, exitPercent: 50, lock: { mode: "FIXED" } },
        { unit: "POINTS", value: 2, exitPercent: 25, lock: { mode: "MARGIN", unit: "POINTS", value: 0.5 } },
      ],
    },
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
    positionInitialQuantity: null,
    positionTargetsHit: 0,
    positionLockedStopPrice: null,
    lastSyncedTime: istSec("11:00"),
    ...over,
  }) as unknown as PaperSessionState;

async function pass(s: PaperSessionState, at: string) {
  const all = minutes("09:15", "15:30");
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
    positionInitialQuantity: r.position?.initialQuantity ?? null,
    positionTargetsHit: r.position?.targetsHit ?? 0,
    positionLockedStopPrice: r.position?.lockedStopPrice ?? null,
    lastSyncedTime: r.lastSyncedTime,
  }) as PaperSessionState;

describe("staged targets across restarts", () => {
  it("sells Target 1's share once, and a restart does not sell it again", async () => {
    const s0 = state();
    const entered = await pass(s0, "11:08");
    expect(entered.newOrders.map((o) => o.reason)).toEqual(["entry_rule"]);
    const s1 = saved(s0, entered);

    const afterT1 = await pass(s1, "11:20"); // price has climbed more than 1 point
    const sells = afterT1.newOrders.filter((o) => o.side === "SELL");
    expect(sells.map((o) => [o.reason, o.targetLevel, o.quantity])).toEqual([["target", 1, 50]]);
    expect(afterT1.position?.quantity).toBe(50);
    expect(afterT1.position?.targetsHit).toBe(1);
    expect(afterT1.position?.lockedStopPrice).toBeGreaterThan(entered.position!.entryPrice);

    const s2 = saved(s1, afterT1);
    const restarted = await pass(s2, "11:20"); // same moment, from the saved state
    expect(restarted.newOrders).toHaveLength(0);
    expect(restarted.position?.quantity).toBe(50);
  });

  it("goes on to Target 2 after a restart, selling its own share of the original position", async () => {
    const s0 = state();
    const s1 = saved(s0, await pass(s0, "11:08"));
    const s2 = saved(s1, await pass(s1, "11:20"));
    const later = await pass(s2, "11:50"); // price is well past Target 2
    const sells = later.newOrders.filter((o) => o.side === "SELL");
    expect(sells.map((o) => [o.targetLevel, o.quantity])).toEqual([[2, 25]]);
    expect(later.position?.quantity).toBe(25);
    expect(later.position?.targetsHit).toBe(2);
  });
});

describe("resyncStaged (after a refused or lost target sale)", () => {
  const held = (over: Record<string, unknown>) => state({ positionEntryPrice: 100, positionQuantity: 50, positionInitialQuantity: 100, positionTargetsHit: 1, positionLockedStopPrice: 101, ...over });

  it("does nothing when the engine and the broker agree", () => {
    const s = held({});
    expect(resyncStaged(s, 50)).toBe(s);
  });
  it("puts the target back when the broker still holds the shares the engine believed sold", () => {
    const r = resyncStaged(held({}), 100);
    expect(r.positionQuantity).toBe(100);
    expect(r.positionTargetsHit).toBe(0);
    expect(r.positionLockedStopPrice).toBeNull();
  });
  it("moves on when the broker really sold more than the engine knew", () => {
    const r = resyncStaged(held({ positionTargetsHit: 0, positionQuantity: 100, positionLockedStopPrice: null }), 50);
    expect(r.positionTargetsHit).toBe(1);
    expect(r.positionLockedStopPrice).toBe(101); // Target 1 is +1 point; the lock sits at its own price
  });
  it("leaves strategies without staged targets alone", () => {
    const s = state({ riskManagement: { stopLoss: null, target: null, trailingSl: null }, positionEntryPrice: 100, positionQuantity: 50 });
    expect(resyncStaged(s, 100)).toBe(s);
  });
});
