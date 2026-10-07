import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtest/run";
import { syncPaperSession, type PaperSessionState } from "@/lib/paper/sync";
import { NEVER_EXIT_CONDITION, type ConditionNode } from "@/lib/strategy/types";
import type { SystemRuntime } from "./types";

// A trading system through the shared engine: bullish and bearish concepts decide the side of each position.
const T0 = Date.parse("2026-09-01T09:15:00+05:30") / 1000;
const DAY = 86_400;
const path = [100, 100, 101, 103, 104, 104, 102, 99, 97, 96, 96, 97, 99, 101, 102, 104, 104, 104];
const candles: Candle[] = path.map((p, i) => ({ time: T0 + i * DAY, open: p, high: p + 0.5, low: p - 0.5, close: p, volume: 1000 }));
const close = (op: "GT" | "LT", v: number): ConditionNode => ({ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: op, right: { kind: "constant", value: v } });
const runtime: SystemRuntime = {
  schema: 1,
  concepts: [
    { name: "Up", side: "BULLISH", condition: close("GT", 102.5), optionals: [], timeframeRank: 0 },
    { name: "Down", side: "BEARISH", condition: close("LT", 98), optionals: [], timeframeRank: 0 },
  ],
  conflict: { rule: "IGNORE", confirmBars: 1 },
  opposite: { whenLong: "REVERSE", whenShort: "REVERSE", confirmBars: 0 },
  allowShort: true,
  entryWindows: [],
  noTradeWindows: [],
};
const base = { entryCondition: close("GT", 1_000_000), exitCondition: NEVER_EXIT_CONDITION };
const cfg = (over: object = {}) => ({ startingCapital: 100_000, brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY" as const, value: 10 }, direction: "LONG" as const, system: runtime, ...over });

describe("a trading system in a backtest", () => {
  it("goes long on the bullish concept, then reverses to short on the bearish one", () => {
    const r = runBacktest(candles, base.entryCondition, base.exitCondition, cfg());
    expect(r.trades.map((t) => t.direction)).toEqual(["LONG", "SHORT", "LONG"]);
    const [long, short] = r.trades;
    expect(long.direction).toBe("LONG");
    expect(long.netPnl).toBeGreaterThan(-100_000);
    expect(short.direction).toBe("SHORT");
    // The reversal exit and the short's entry fill at the same open.
    expect(short.entryTime).toBe(long.exitTime);
    // Shorted at 96 (the open after the bearish setup), covered at 104 when the bullish one returned: a loss of 8 × 10.
    expect([short.entryPrice, short.exitPrice, short.netPnl]).toEqual([96, 104, -80]);
  });
  it("a delivery system never goes short: the bearish concept only closes the long", () => {
    const r = runBacktest(candles, base.entryCondition, base.exitCondition, cfg({ system: { ...runtime, allowShort: false } }));
    expect(r.trades.every((t) => t.direction === "LONG")).toBe(true);
  });
});

describe("a trading system in a forward test", () => {
  const market = { getHistoricalCandles: async () => candles } as never;
  const session = (over: Partial<PaperSessionState> = {}): PaperSessionState => ({
    instrumentSymbol: "X.NS", direction: "LONG", entryCondition: base.entryCondition, exitCondition: NEVER_EXIT_CONDITION, brokeragePercent: 0, slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 10 }, timeframe: "1d", cash: 100_000, positionEntryTime: null, positionEntryPrice: null, positionQuantity: null,
    positionFavorableExtreme: null, positionStopLossPrice: null, positionTargetPrice: null, positionPyramidCount: null, lastSyncedTime: null, system: runtime, ...over,
  });
  it("records each order with the side of the position it opened or closed", async () => {
    const r = await syncPaperSession(session(), true, market, { includeForming: true });
    const sides = r.newOrders.map((o) => `${o.positionSide}:${o.side}:${o.reason}`);
    expect(sides[0]).toBe("LONG:BUY:entry_rule");
    expect(sides).toContain("LONG:SELL:reversal");
    expect(sides).toContain("SHORT:SELL:entry_rule");
    expect(r.systemMemo).not.toBeNull();
  });
  it("resumes from a saved short position across syncs", async () => {
    const half = await syncPaperSession(session({ lastSyncedTime: null }), true, { getHistoricalCandles: async () => candles.slice(0, 12) } as never, { includeForming: true });
    expect(half.positionDirection).toBe("SHORT");
    const pos = half.position!;
    const rest = await syncPaperSession(
      session({ cash: half.cash, lastSyncedTime: half.lastSyncedTime, positionEntryTime: pos.entryTime, positionEntryPrice: pos.entryPrice, positionQuantity: pos.quantity, positionFavorableExtreme: pos.favorableExtreme, positionPyramidCount: pos.pyramidCount, positionDirection: half.positionDirection, systemMemo: half.systemMemo }),
      true, market, { includeForming: true },
    );
    expect(rest.newOrders[0].positionSide).toBe("SHORT"); // the short is closed as a short (a BUY), not as a long
    expect(rest.newOrders[0].side).toBe("BUY");
  });
});

describe("most capital one position may use", () => {
  const sized = (cap?: number) =>
    runBacktest(candles, base.entryCondition, base.exitCondition, cfg({ startingCapital: 10_000, positionSizing: { mode: "FULL_CAPITAL" }, system: { ...runtime, allowShort: false }, ...(cap ? { riskOptions: { reference: "PRICE", leverage: 1, breakEven: null, maxDailyLossPercent: null, maxDrawdownPercent: null, maxCapitalUsePercent: cap } } : {}) })).trades[0].quantity;
  it("caps the position at that share of the capital", () => {
    const full = sized();
    expect(sized(50)).toBeLessThanOrEqual(Math.floor(10_000 * 0.5 / 104));
    expect(sized(50)).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(sized(50));
  });
});
