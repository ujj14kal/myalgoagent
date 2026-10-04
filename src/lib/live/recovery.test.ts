import { describe, expect, it } from "vitest";
import { syncPaperSession, type PaperSessionState } from "@/lib/paper/sync";
import type { ConditionNode } from "@/lib/strategy/types";

// What a live strategy does across restarts: its state is saved after every pass and handed back on the
// next one, so a restart (or a second engine) must never repeat an entry or an exit, never invent one, and
// must carry on correctly from an open position. Same engine and state hand-off as the live deployment.

const DAY = "2026-10-05"; // a Monday
const istSec = (hhmm: string) => Math.floor(new Date(`${DAY}T${hhmm}:00+05:30`).getTime() / 1000);
const minutes = (from: string, to: string) => {
  const out = [];
  for (let t = istSec(from), px = 295; t <= istSec(to); t += 60, px += 0.05) out.push({ time: t, open: px, high: px + 0.2, low: px - 0.2, close: px + 0.05, volume: 100 });
  return out;
};
const win = (start: number, end: number): ConditionNode => ({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: start, endMinute: end } });
const state = (over: Record<string, unknown> = {}): PaperSessionState =>
  ({
    instrumentSymbol: "TARIL.NS",
    direction: "SHORT",
    entryCondition: win(11 * 60 + 3, 11 * 60 + 4),
    exitCondition: win(11 * 60 + 30, 15 * 60 + 30),
    brokeragePercent: 0,
    slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 1 },
    riskManagement: { stopLoss: null, target: null, trailingSl: null },
    maxPyramidEntries: 1,
    timeframe: "1m",
    noEntryAfterMinute: 14 * 60 + 30,
    squareOffMinute: 15 * 60 + 15,
    productType: "INTRADAY",
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
    cash: 5000,
    positionEntryTime: null,
    positionEntryPrice: null,
    positionQuantity: null,
    positionFavorableExtreme: null,
    positionStopLossPrice: null,
    positionTargetPrice: null,
    lastSyncedTime: istSec("11:00"),
    ...over,
  }) as unknown as PaperSessionState;

/** One pass at a given clock time over the candles up to then — what the engine does every few seconds. */
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
/** What runDeployment saves after a pass and the next pass (or a restarted engine) starts from. */
const saved = (s: PaperSessionState, r: Awaited<ReturnType<typeof pass>>): PaperSessionState =>
  ({ ...s, cash: r.cash, positionEntryTime: r.position?.entryTime ?? null, positionEntryPrice: r.position?.entryPrice ?? null, positionQuantity: r.position?.quantity ?? null, positionFavorableExtreme: r.position?.favorableExtreme ?? null, positionStopLossPrice: r.position?.stopLossPrice ?? null, positionTargetPrice: r.position?.targetPrice ?? null, lastSyncedTime: r.lastSyncedTime }) as PaperSessionState;

describe("time-based strategy across restarts", () => {
  it("enters exactly once when its time arrives", async () => {
    const r = await pass(state(), "11:10");
    expect(r.newOrders).toHaveLength(1);
    expect(r.newOrders[0]).toMatchObject({ side: "SELL", reason: "entry_rule" });
    expect(r.position?.quantity).toBe(1);
  });

  it("never repeats the entry when the state is handed back — a restart, or a second engine", async () => {
    const s = state();
    const first = await pass(s, "11:10");
    const again = await pass(saved(s, first), "11:10"); // same moment, restarted from the saved state
    const later = await pass(saved(s, first), "11:25"); // a few minutes on
    expect(first.newOrders).toHaveLength(1);
    expect(again.newOrders).toHaveLength(0);
    expect(later.newOrders).toHaveLength(0);
    expect(later.position?.quantity).toBe(1); // still holding the one position
  });

  it("does not enter when it starts after the entry window (late start waits for the next day)", async () => {
    const r = await pass(state({ lastSyncedTime: istSec("11:08") }), "11:20");
    expect(r.newOrders).toHaveLength(0);
    expect(r.position).toBeNull();
  });

  it("does not enter before its time", async () => {
    const r = await pass(state(), "11:01");
    expect(r.newOrders).toHaveLength(0);
  });

  it("restarted with a position open: no second entry, one exit when the exit time arrives, never twice", async () => {
    const s = state();
    const entered = await pass(s, "11:10");
    const held = saved(s, entered);
    const before = await pass(held, "11:20");
    expect(before.newOrders).toHaveLength(0); // exit time (11:30) not reached
    const exit = await pass(saved(held, before), "11:40");
    expect(exit.newOrders).toHaveLength(1);
    expect(exit.newOrders[0]).toMatchObject({ side: "BUY", reason: "exit_rule" }); // closing a short buys back
    expect(exit.position).toBeNull();
    const after = await pass(saved(held, exit), "11:50"); // restarted after the exit
    expect(after.newOrders).toHaveLength(0);
  });

  it("squares an intraday position off at the square-off time, once", async () => {
    const s = state({ exitCondition: win(15 * 60 + 29, 15 * 60 + 30) }); // exit rule far away: square-off does it
    const entered = await pass(s, "11:10");
    const r = await pass(saved(s, entered), "15:16");
    expect(r.newOrders).toHaveLength(1);
    expect(r.newOrders[0]).toMatchObject({ side: "BUY", reason: "square_off" });
    const again = await pass(saved(s, r), "15:17");
    expect(again.newOrders).toHaveLength(0);
  });
});
