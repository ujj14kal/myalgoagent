import { describe, expect, it } from "vitest";
import { syncPaperSession, type PaperSessionState } from "./sync";
import { parseDsl } from "@/lib/strategy/dsl";

// A weekly strategy through the same sync a forward test and a live strategy use: it acts on a closed week and fills at
// the next Monday's open, exactly once, across restarts.

const ist = (iso: string) => Math.floor(new Date(`${iso}+05:30`).getTime() / 1000);
const mondays = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"];
//                 98            99            101 (cross)   103           104           99 (cross down) 97          96
const closes = [98, 99, 101, 103, 104, 99, 97, 96];
const weeks = mondays.map((m, i) => ({ time: ist(`${m}T09:15:00`), open: closes[i] - 0.5, high: closes[i] + 1, low: closes[i] - 1, close: closes[i], volume: 1000 }));

const state = (over: Record<string, unknown> = {}): PaperSessionState =>
  ({
    instrumentSymbol: "TARIL.NS",
    direction: "LONG",
    entryCondition: parseDsl("close crossesAbove 100"),
    exitCondition: parseDsl("close crossesBelow 100"),
    brokeragePercent: 0,
    slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 10 },
    riskManagement: { stopLoss: null, target: null, trailingSl: null },
    maxPyramidEntries: 1,
    timeframe: "1wk",
    productType: "DELIVERY",
    orderType: "MARKET",
    cash: 100_000,
    positionEntryTime: null,
    positionEntryPrice: null,
    positionQuantity: null,
    positionFavorableExtreme: null,
    positionStopLossPrice: null,
    positionTargetPrice: null,
    lastSyncedTime: ist("2026-08-03T09:00:00"),
    ...over,
  }) as unknown as PaperSessionState;

async function pass(s: PaperSessionState, now: string, includeForming: boolean) {
  const nowSec = ist(now);
  const market = { name: "t", isOfficial: false, depth: "standard" as const, getHistoricalCandles: async () => weeks.filter((w) => w.time <= nowSec) };
  const realNow = Date.now;
  Date.now = () => nowSec * 1000;
  try {
    return await syncPaperSession(s, true, market, { includeForming });
  } finally {
    Date.now = realNow;
  }
}
const saved = (s: PaperSessionState, r: Awaited<ReturnType<typeof pass>>): PaperSessionState =>
  ({ ...s, cash: r.cash, positionEntryTime: r.position?.entryTime ?? null, positionEntryPrice: r.position?.entryPrice ?? null, positionQuantity: r.position?.quantity ?? null, positionFavorableExtreme: r.position?.favorableExtreme ?? null, positionStopLossPrice: r.position?.stopLossPrice ?? null, positionTargetPrice: r.position?.targetPrice ?? null, lastSyncedTime: r.lastSyncedTime }) as PaperSessionState;

describe("a weekly strategy", () => {
  it("live: buys at the next Monday's open once the week has closed — and not before", async () => {
    // the week of 17 Aug closed above 100; the week of 24 Aug has begun
    const during = await pass(state(), "2026-08-20T11:00:00", true); // mid-week of the signal: it has not closed
    expect(during.newOrders).toHaveLength(0);
    const monday = await pass(state(), "2026-08-24T10:00:00", true);
    expect(monday.newOrders.map((o) => [o.side, o.reason, o.time])).toEqual([["BUY", "entry_rule", weeks[3].time]]);
    expect(monday.newOrders[0].price).toBe(weeks[3].open);
  });
  it("never buys twice when the saved state is handed back (a restart, a second engine)", async () => {
    const s0 = state();
    const first = await pass(s0, "2026-08-24T10:00:00", true);
    const again = await pass(saved(s0, first), "2026-08-24T10:00:00", true);
    const later = await pass(saved(s0, first), "2026-08-27T13:00:00", true); // mid-week, same position
    expect(again.newOrders).toHaveLength(0);
    expect(later.newOrders).toHaveLength(0);
    expect(later.position?.quantity).toBe(10);
  });
  it("sells at the next Monday's open after the week closes below its exit level", async () => {
    const s0 = state();
    const bought = saved(s0, await pass(s0, "2026-08-24T10:00:00", true));
    const sold = await pass(bought, "2026-09-14T10:00:00", true); // the week of 7 Sep closed at 99, below 100; the week of 14 Sep has begun
    expect(sold.newOrders.map((o) => [o.side, o.reason, o.time])).toEqual([["SELL", "exit_rule", weeks[6].time]]);
    expect(sold.position).toBeNull();
  });
  it("forward test: acts only once the following week has also closed", async () => {
    const early = await pass(state(), "2026-08-24T10:00:00", false); // the week of 24 Aug has not closed
    expect(early.newOrders).toHaveLength(0);
    const after = await pass(state(), "2026-09-04T16:00:00", false); // the week of 24 Aug closed
    expect(after.newOrders.map((o) => o.reason)).toEqual(["entry_rule"]);
  });
});
