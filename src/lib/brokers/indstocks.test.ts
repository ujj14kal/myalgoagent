import { describe, expect, it } from "vitest";
import { indstocksStatus, LIVE_BROKERS } from "./live-brokers";
import { CANDLE_SOURCES } from "./broker-candles";
import { ADAPTERS } from "./adapters";
import { brokerById, loginView } from "./catalog";

describe("INDstocks", () => {
  it("is connectable, with live orders switched on as unproven", () => {
    expect(brokerById("indstocks")?.availability).toBe("live");
    expect(ADAPTERS.indstocks).toBeDefined();
    expect(LIVE_BROKERS.indstocks?.verified).toBe(false);
    expect(LIVE_BROKERS.indstocks?.fno).toBe(false);
    expect(loginView(brokerById("indstocks")!, null).fields.map((f) => f.name)).toEqual(["apiKey"]);
  });
  it("reads INDstocks order statuses", () => {
    expect(indstocksStatus("SUCCESS", 10, 10)).toBe("FILLED");
    expect(indstocksStatus("PARTIALLY FILLED", 4, 10)).toBe("PARTIALLY_FILLED");
    expect(indstocksStatus("PARTIALLY FILLED - CANCELLED", 4, 10)).toBe("PARTIALLY_FILLED");
    expect(indstocksStatus("SL-PENDING", 0, 10)).toBe("TRIGGER_PENDING");
    expect(indstocksStatus("CANCELLED", 0, 10)).toBe("CANCELLED");
    expect(indstocksStatus("EXPIRED", 0, 10)).toBe("CANCELLED");
    expect(indstocksStatus("FAILED", 0, 10)).toBe("FAILED");
    expect(indstocksStatus("ABORTED", 0, 10)).toBe("FAILED");
    for (const s of ["QUEUED", "O-PENDING", "PROCESSING", "INITIATED", "PENDING", "MODIFIED"]) expect(indstocksStatus(s, 0, 10)).toBe("OPEN");
  });
  it("builds candle requests in milliseconds, one window at a time, and reads the reply", () => {
    const src = CANDLE_SOURCES.indstocks!;
    const eq = { token: "2885" } as never;
    const day = 86400;
    const reqs = src.request(eq, src.intervals["5m"]!, "5m", 1_700_000_000, 1_700_000_000 + 10 * day);
    expect(reqs.length).toBe(2); // 7-day windows
    expect(reqs[0].url).toContain("/market/historical/5minute?scrip-codes=NSE_2885&start_time=1700000000000");
    const candles = src.parse({ success: true, data: { NSE_2885: { candles: [{ ts: 1_700_000_000, o: 1, h: 3, l: 0.5, c: 2, v: 100 }] } } });
    expect(candles).toEqual([{ time: 1_700_000_000, open: 1, high: 3, low: 0.5, close: 2, volume: 100 }]);
  });
});

import { motilalHeaders } from "./motilal-headers";
import { LIVE_NOT_YET } from "./live-brokers";
describe("Motilal Oswal", () => {
  it("is connectable but has no live orders yet", () => {
    expect(brokerById("motilal")?.availability).toBe("live");
    expect(ADAPTERS.motilal).toBeDefined();
    expect(LIVE_BROKERS.motilal).toBeUndefined();
    expect(LIVE_NOT_YET.motilal).toMatch(/static IP/);
  });
  it("sends the headers Motilal asks for on every call", () => {
    const h = motilalHeaders({ apiKey: "K", apiSecret: "S", clientId: "A1" }, "TOKEN");
    expect(h).toMatchObject({ Authorization: "TOKEN", ApiKey: "K", apisecretkey: "S", vendorinfo: "A1", SourceId: "WEB" });
  });
  it("starts login on Motilal's own page with our API key", async () => {
    const url = await ADAPTERS.motilal!.loginUrl({ apiKey: "KEY 1" }, { state: "x", redirectUri: "y" });
    expect(url).toBe("https://invest.motilaloswal.com/OpenAPI/Login.aspx?apikey=KEY%201");
  });
});
