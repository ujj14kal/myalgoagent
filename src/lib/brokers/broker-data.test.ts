import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./egress", () => ({ brokerFetch: vi.fn() }));
vi.mock("./nse-lookup", () => ({ nseEquity: vi.fn(async (s: string) => (s === "TATASTEEL" ? { symbol: "TATASTEEL", token: "3499", isin: "INE081A01020", tick: 0.01, series: "EQ" } : null)) }));

import { brokerFetch } from "./egress";
import { BrokerDataUnavailable, brokerCandles, calendarResample, plan, rangeStart, trimToTradingDays } from "./broker-data";
import { CANDLE_SOURCES } from "./broker-candles";

const ctx = { creds: { apiKey: "k" } as never, token: "t" };
const T = Date.UTC(2026, 9, 5, 4, 40) / 1000; // 10:10 IST
const reply = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) });

beforeEach(() => {
  vi.mocked(brokerFetch).mockReset();
});

describe("building timeframes a broker doesn't serve", () => {
  it("asks for the nearest native interval", () => {
    expect(plan(CANDLE_SOURCES.groww!, "3m")!.base).toBe("1m");
    expect(plan(CANDLE_SOURCES.dhan!, "30m")!.base).toBe("15m");
    expect(plan(CANDLE_SOURCES.zerodha!, "1wk")!.base).toBe("1d");
    expect(plan(CANDLE_SOURCES.zerodha!, "4h")!.base).toBe("60m");
    expect(plan(CANDLE_SOURCES.groww!, "4h")!.base).toBe("4h");
  });
  it("groups daily candles into weeks and months", () => {
    const day = (y: number, m: number, d: number, c: number) => ({ time: Date.UTC(y, m, d) / 1000 - 19800, open: c, high: c + 1, low: c - 1, close: c, volume: 1 });
    // Mon 5 Oct … Fri 9 Oct, then Mon 12 Oct
    const days = [5, 6, 7, 8, 9, 12].map((d, i) => day(2026, 9, d, 100 + i));
    const weeks = calendarResample(days, "week");
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ open: 100, close: 104, high: 105, low: 99, volume: 5 });
    expect(calendarResample([day(2026, 8, 30, 1), day(2026, 9, 1, 2)], "month")).toHaveLength(2);
  });
  it("keeps only the latest trading day for 1d", () => {
    const c = [T - 86400 * 3, T - 60, T].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0 }));
    expect(trimToTradingDays(c, "1d").map((x) => x.time)).toEqual([T - 60, T]);
    expect(trimToTradingDays(c, "1mo")).toHaveLength(3);
  });
  it("reaches back far enough for each range", () => {
    expect(T - rangeStart("1mo", T)).toBe(31 * 86400);
    expect(rangeStart("ytd", T)).toBe(Date.UTC(2026, 0, 1) / 1000 - 19800);
  });
});

describe("brokerCandles", () => {
  it("fetches, merges and returns candles from the user's broker", async () => {
    vi.mocked(brokerFetch).mockResolvedValue(reply(200, { status: "SUCCESS", payload: { candles: [["2026-10-05T10:10:00", 180, 181, 179, 180.5, 10], ["2026-10-05T10:11:00", 180.5, 182, 180, 181, 12]] } }) as never);
    const c = await brokerCandles("groww", ctx, "TATASTEEL.NS", "1d", "1m", T + 120);
    expect(c.map((x) => x.close)).toEqual([180.5, 181]);
    const [url, init] = vi.mocked(brokerFetch).mock.calls[0];
    expect(String(url)).toContain("groww_symbol=NSE-TATASTEEL");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer t", "X-API-VERSION": "1.0" });
  });
  it("builds 3-minute candles from 1-minute ones", async () => {
    const rows = [0, 1, 2, 3].map((i) => [`2026-10-05T09:${15 + i}:00`, 100 + i, 101 + i, 99 + i, 100.5 + i, 1]);
    vi.mocked(brokerFetch).mockResolvedValue(reply(200, { payload: { candles: rows } }) as never);
    const c = await brokerCandles("groww", ctx, "TATASTEEL.NS", "1d", "3m", T);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ open: 100, close: 102.5, volume: 3 });
  });
  it("a refused data request (no data plan) is reported plainly, so callers fall back", async () => {
    vi.mocked(brokerFetch).mockResolvedValue(reply(403, { error: { message: "Access denied" } }) as never);
    await expect(brokerCandles("groww", ctx, "TATASTEEL.NS", "1d", "1m", T)).rejects.toMatchObject({ reason: "no_access" });
  });
  it("is unavailable for brokers without a data API here, non-NSE symbols and unknown stocks", async () => {
    await expect(brokerCandles("aliceblue", ctx, "TATASTEEL.NS", "1d", "1m", T)).rejects.toBeInstanceOf(BrokerDataUnavailable);
    await expect(brokerCandles("groww", ctx, "^NSEI", "1d", "1m", T)).rejects.toMatchObject({ reason: "unsupported" });
    await expect(brokerCandles("groww", ctx, "NOSUCH.NS", "1d", "1m", T)).rejects.toMatchObject({ reason: "unsupported" });
    expect(brokerFetch).not.toHaveBeenCalled();
  });
  it("an empty answer counts as unavailable, never as 'no prices'", async () => {
    vi.mocked(brokerFetch).mockResolvedValue(reply(200, { payload: { candles: [] } }) as never);
    await expect(brokerCandles("groww", ctx, "TATASTEEL.NS", "1d", "1m", T)).rejects.toMatchObject({ reason: "empty" });
  });
  it("a 200 reply that reports failure inside is an error", async () => {
    vi.mocked(brokerFetch).mockResolvedValue(reply(200, { status: false, message: "Invalid token" }) as never);
    await expect(brokerCandles("angelone", ctx, "TATASTEEL.NS", "1d", "1m", T)).rejects.toThrow();
  });
});
