import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const getHistoricalCandles = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { paperSession: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/market-data", () => ({ marketDataProvider: { getHistoricalCandles: (...a: unknown[]) => getHistoricalCandles(...a) } }));

import { getPaperSessionRows, summarizePortfolio } from "@/lib/portfolio";

function session(over: Record<string, unknown>) {
  return {
    id: "s", instrumentSymbol: "ADANIENT.NS", direction: "LONG", startingCapital: 100_000, cash: 100_000,
    positionQuantity: null, positionEntryPrice: null, ...over,
  };
}

beforeEach(() => {
  findMany.mockReset();
  getHistoricalCandles.mockReset();
});

describe("getPaperSessionRows equity", () => {
  it("regression: an open long is marked to market, not added on top of un-debited cash", async () => {
    // The real case that showed +97.68%: 33 shares bought at 2997.10, now 2960.10.
    findMany.mockResolvedValue([session({ positionQuantity: 33, positionEntryPrice: 2997.1 })]);
    getHistoricalCandles.mockResolvedValue([{ close: 2960.1 }]);

    const [row] = await getPaperSessionRows("u");

    expect(row.equity).toBeCloseTo(100_000 + (2960.1 - 2997.1) * 33, 6);
    expect(row.pnlPct).toBeCloseTo(-1.221, 2);
    expect(row.pnlPct).toBeLessThan(0);
    expect(row.availableCash + row.positionValue).toBeCloseTo(row.equity, 6);
  });

  it("marks a short the other way round", async () => {
    findMany.mockResolvedValue([session({ direction: "SHORT", positionQuantity: 10, positionEntryPrice: 100 })]);
    getHistoricalCandles.mockResolvedValue([{ close: 90 }]);

    const [row] = await getPaperSessionRows("u");

    expect(row.equity).toBeCloseTo(100_100, 6);
    expect(row.availableCash - row.positionValue).toBeCloseTo(row.equity, 6);
  });

  it("falls back to zero unrealized P&L when the quote can't be fetched", async () => {
    findMany.mockResolvedValue([session({ positionQuantity: 5, positionEntryPrice: 200 })]);
    getHistoricalCandles.mockRejectedValue(new Error("down"));

    const [row] = await getPaperSessionRows("u");

    expect(row.equity).toBe(100_000);
  });

  it("flat sessions are unchanged", async () => {
    findMany.mockResolvedValue([session({ cash: 101_500 })]);
    const [row] = await getPaperSessionRows("u");
    expect(row.equity).toBe(101_500);
    expect(row.positionValue).toBe(0);
  });

  it("summary totals add up (available cash + positions = equity) for longs", async () => {
    findMany.mockResolvedValue([
      session({ id: "a", positionQuantity: 33, positionEntryPrice: 2997.1 }),
      session({ id: "b" }),
    ]);
    getHistoricalCandles.mockResolvedValue([{ close: 2960.1 }]);
    const s = summarizePortfolio(await getPaperSessionRows("u"));
    expect(s.totalCash + s.totalPositionValue).toBeCloseTo(s.totalEquity, 6);
    expect(s.totalPnlPct).toBeLessThan(0);
  });
});
