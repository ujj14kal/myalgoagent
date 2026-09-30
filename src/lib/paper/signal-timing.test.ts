import { describe, expect, it } from "vitest";
import { syncPaperSession, type PaperSessionState } from "./sync";

const day = 86400;
const base = 1_700_000_000 - (1_700_000_000 % day) - 19_800 + 9 * 3600 + 15 * 60; // 09:15 IST
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ time: base + i * day, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));

describe("signal on the newest closed candle", () => {
  it("is acted on once the next candle exists", async () => {
    const all = mk(40);
    let view = all.slice(0, 30); // bar 29 is the newest closed candle
    const market = { name: "t", isOfficial: false, depth: "standard" as const, getHistoricalCandles: async () => view };
    const entry = { kind: "comparison" as const, left: { kind: "price" as const, field: "CLOSE" as const }, operator: "GTE" as const, right: { kind: "constant" as const, value: all[29].close } };
    const never = { kind: "comparison" as const, left: { kind: "constant" as const, value: 0 }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };
    const s: PaperSessionState = { instrumentSymbol: "X.NS", direction: "LONG", entryCondition: entry, exitCondition: never, brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 1 }, cash: 100000, positionEntryTime: null, positionEntryPrice: null, positionQuantity: null, positionFavorableExtreme: null, positionStopLossPrice: null, positionTargetPrice: null, lastSyncedTime: all[28].time } as PaperSessionState;
    const r1 = await syncPaperSession(s, true, market);
    view = all.slice(0, 31);
    const r2 = await syncPaperSession({ ...s, lastSyncedTime: r1.lastSyncedTime }, true, market);
    // Bar 29's signal waits for bar 30 (instead of being marked done and lost), then fills at bar 30's open.
    expect(r1.newOrders).toHaveLength(0);
    expect(r1.lastSyncedTime).toBe(all[28].time);
    expect(r2.newOrders).toHaveLength(1);
    expect(r2.newOrders[0]).toMatchObject({ side: "BUY", time: all[30].time, price: all[30].open, signalTime: all[29].time });
  });

  it("live deployments fill at the forming candle's open straight away", async () => {
    const all = mk(40);
    const nowSec = all[30].time + 60; // bar 30 has just started forming
    const view = all.slice(0, 31);
    const market = { name: "t", isOfficial: false, depth: "standard" as const, getHistoricalCandles: async () => view };
    const entry = { kind: "comparison" as const, left: { kind: "price" as const, field: "CLOSE" as const }, operator: "GTE" as const, right: { kind: "constant" as const, value: all[29].close } };
    const never = { kind: "comparison" as const, left: { kind: "constant" as const, value: 0 }, operator: "GT" as const, right: { kind: "constant" as const, value: 1 } };
    const s = { instrumentSymbol: "X.NS", direction: "LONG", entryCondition: entry, exitCondition: never, brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 1 }, cash: 100000, positionEntryTime: null, positionEntryPrice: null, positionQuantity: null, positionFavorableExtreme: null, positionStopLossPrice: null, positionTargetPrice: null, lastSyncedTime: all[28].time } as unknown as PaperSessionState;
    const realNow = Date.now;
    Date.now = () => nowSec * 1000;
    try {
      const r = await syncPaperSession(s, true, market, { includeForming: true });
      expect(r.newOrders).toHaveLength(1);
      expect(r.newOrders[0]).toMatchObject({ side: "BUY", time: all[30].time, signalTime: all[29].time });
      expect(r.lastSyncedTime).toBe(all[29].time);
    } finally {
      Date.now = realNow;
    }
  });
});
