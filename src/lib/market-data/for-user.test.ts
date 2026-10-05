import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn(), logError: vi.fn() }));
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { brokerConnection: { findMany } } }));
const general = { name: "Yahoo Finance", isOfficial: false, depth: "standard" as const, getHistoricalCandles: vi.fn(async () => [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 0 }]) };
vi.mock("./index", () => ({ marketDataFor: () => general }));
const brokerGet = vi.fn();
vi.mock("@/lib/brokers/broker-data", async () => {
  class BrokerDataUnavailable extends Error {
    constructor(m: string, readonly reason: string) {
      super(m);
    }
  }
  return { BrokerDataUnavailable, brokerMarketData: () => ({ name: "Groww (your broker account)", isOfficial: true, depth: "extended", getHistoricalCandles: brokerGet }) };
});

import { forgetBrokerChoice, userMarketData, userMarketDataReady } from "./for-user";
import { BrokerDataUnavailable } from "@/lib/brokers/broker-data";

const connected = [{ broker: "groww", tokenExpiresAt: new Date(Date.now() + 3_600_000) }];

beforeEach(() => {
  forgetBrokerChoice("u1");
  findMany.mockReset();
  brokerGet.mockReset();
  general.getHistoricalCandles.mockClear();
});

describe("userMarketData", () => {
  it("uses the user's own broker when it supplies data", async () => {
    findMany.mockResolvedValue(connected);
    brokerGet.mockResolvedValue([{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 0 }]);
    const p = userMarketData("u1", "view");
    expect((await p.getHistoricalCandles("TATASTEEL.NS", "1d", "1m"))[0].close).toBe(2);
    expect(p.name).toBe("Groww (your broker account)");
    expect(p.isOfficial).toBe(true);
    expect(general.getHistoricalCandles).not.toHaveBeenCalled();
  });
  it("falls back to the general feed (free trial, no data plan) and labels it", async () => {
    findMany.mockResolvedValue(connected);
    brokerGet.mockRejectedValue(new BrokerDataUnavailable("Groww refused market data", "no_access"));
    const p = userMarketData("u1", "view");
    expect((await p.getHistoricalCandles("TATASTEEL.NS", "1d", "1m"))[0].close).toBe(1);
    expect(p.name).toBe("Yahoo Finance");
    // Remembered: the next request skips the broker instead of asking again.
    await userMarketData("u1", "view").getHistoricalCandles("TATASTEEL.NS", "5d", "1m");
    expect(brokerGet).toHaveBeenCalledTimes(1);
  });
  it("uses the general feed for users with no broker, and for non-NSE symbols", async () => {
    findMany.mockResolvedValue([]);
    await userMarketData("u1", "view").getHistoricalCandles("TATASTEEL.NS", "1d", "1m");
    findMany.mockResolvedValue(connected);
    forgetBrokerChoice("u1");
    await userMarketData("u1", "view").getHistoricalCandles("^NSEI", "1d", "1m");
    expect(brokerGet).not.toHaveBeenCalled();
    expect(general.getHistoricalCandles).toHaveBeenCalledTimes(2);
  });
  it("ignores an expired broker login", async () => {
    findMany.mockResolvedValue([{ broker: "groww", tokenExpiresAt: new Date(Date.now() - 1000) }]);
    await userMarketData("u1", "view").getHistoricalCandles("TATASTEEL.NS", "1d", "1m");
    expect(brokerGet).not.toHaveBeenCalled();
  });
  it("the ready version reports the broker's deeper history before fetching", async () => {
    findMany.mockResolvedValue(connected);
    expect((await userMarketDataReady("u1", "backtest")).depth).toBe("extended");
    forgetBrokerChoice("u1");
    findMany.mockResolvedValue([]);
    expect((await userMarketDataReady("u1", "backtest")).depth).toBe("standard");
  });
});
