import { describe, expect, it } from "vitest";
import { brokerTime, CANDLE_SOURCES, istString, kiteInstrumentToken, rowsToCandles, windows } from "./broker-candles";
import type { NseEquity } from "./nse-master";

const TATA: NseEquity = { symbol: "TATASTEEL", token: "3499", isin: "INE081A01020", tick: 0.01, series: "EQ" };
// 2026-10-05 10:10:00 IST
const T = Date.UTC(2026, 9, 5, 4, 40) / 1000;

describe("time helpers", () => {
  it("formats unix time as IST wall clock", () => {
    expect(istString(T)).toBe("2026-10-05 10:10:00");
    expect(istString(T, "minute")).toBe("2026-10-05 10:10");
    expect(istString(T, "date")).toBe("2026-10-05");
  });
  it("reads every broker's timestamp style", () => {
    expect(brokerTime("2026-10-05T10:10:00")).toBe(T); // Groww / 5paisa: no offset = IST
    expect(brokerTime("2026-10-05 10:10:00")).toBe(T);
    expect(brokerTime("2026-10-05T10:10:00+0530")).toBe(T); // Kite
    expect(brokerTime("2026-10-05T10:10:00+05:30")).toBe(T); // Upstox / Angel One
    expect(brokerTime(T)).toBe(T); // Fyers / Dhan epoch seconds
    expect(brokerTime(T * 1000)).toBe(T); // epoch ms
    expect(brokerTime("garbage")).toBeNull();
  });
  it("splits a long span into request windows", () => {
    expect(windows(0, 10 * 86400, 4)).toHaveLength(3);
    expect(windows(0, 86400, 30)).toEqual([[0, 86400]]);
  });
  it("turns rows into candles oldest first, skipping bad rows", () => {
    const c = rowsToCandles([["2026-10-05T10:11:00", 1, 2, 0.5, 1.5, 10], ["bad"], ["2026-10-05T10:10:00", 1, 2, 0.5, 1.2, null]]);
    expect(c.map((x) => x.time)).toEqual([T, T + 60]);
    expect(c[0].volume).toBe(0);
  });
});

describe("Zerodha instrument token", () => {
  it("is the NSE token × 256 + 1 (checked against Kite's instrument list)", () => {
    expect(kiteInstrumentToken("2885")).toBe(738561); // RELIANCE
    expect(kiteInstrumentToken("3499")).toBe(895745); // TATASTEEL
  });
});

const req = (broker: keyof typeof CANDLE_SOURCES, interval: "1m" | "1d" = "1m", from = T - 3600, to = T) => {
  const s = CANDLE_SOURCES[broker]!;
  return s.request(TATA, s.intervals[interval]!, interval, from, to);
};

describe("requests per broker (from each broker's API docs)", () => {
  it("Groww", () => {
    const [r] = req("groww");
    expect(r.method).toBe("GET");
    expect(r.url).toContain("https://api.groww.in/v1/historical/candles?");
    expect(r.url).toContain("groww_symbol=NSE-TATASTEEL");
    expect(r.url).toContain("candle_interval=1minute");
    expect(r.url).toContain("segment=CASH");
    expect(decodeURIComponent(r.url.replace(/\+/g, " "))).toContain("start_time=2026-10-05 09:10:00");
  });
  it("Zerodha", () => {
    const [r] = req("zerodha");
    expect(r.url).toMatch(/^https:\/\/api\.kite\.trade\/instruments\/historical\/895745\/minute\?from=/);
  });
  it("Upstox: history to yesterday plus today's intraday call", () => {
    const rs = req("upstox", "1m", T - 3 * 86400, Math.floor(Date.now() / 1000));
    expect(rs[0].url).toContain("https://api.upstox.com/v3/historical-candle/NSE_EQ%7CINE081A01020/minutes/1/");
    expect(rs.at(-1)!.url).toBe("https://api.upstox.com/v3/historical-candle/intraday/NSE_EQ%7CINE081A01020/minutes/1");
  });
  it("Fyers", () => {
    const [r] = req("fyers");
    expect(r.url).toContain("https://api-t1.fyers.in/data/history?");
    expect(r.url).toContain("symbol=NSE%3ATATASTEEL-EQ");
    expect(r.url).toContain("resolution=1&date_format=0");
  });
  it("Angel One", () => {
    const [r] = req("angelone");
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData");
    expect(r.json).toEqual({ exchange: "NSE", symboltoken: "3499", interval: "ONE_MINUTE", fromdate: "2026-10-05 09:10", todate: "2026-10-05 10:10" });
  });
  it("Dhan: intraday and daily endpoints", () => {
    expect(req("dhan")[0]).toMatchObject({ method: "POST", url: "https://api.dhan.co/v2/charts/intraday", json: { securityId: "3499", exchangeSegment: "NSE_EQ", instrument: "EQUITY", interval: "1" } });
    expect(req("dhan", "1d")[0]).toMatchObject({ url: "https://api.dhan.co/v2/charts/historical", json: { securityId: "3499", fromDate: "2026-10-05" } });
  });
  it("5paisa", () => {
    expect(req("5paisa")[0].url).toBe("https://openapi.5paisa.com/V2/historical/N/C/3499/1m?from=2026-10-05&end=2026-10-05");
  });
  it("long ranges are split within each broker's per-request limit", () => {
    expect(req("angelone", "1m", T - 100 * 86400, T).length).toBe(4); // 29-day windows
  });
});

describe("responses per broker", () => {
  it("parses each broker's candle shape", () => {
    const row = ["2026-10-05T10:10:00", 180, 181, 179.5, 180.5, 1000];
    expect(CANDLE_SOURCES.groww!.parse({ status: "SUCCESS", payload: { candles: [[...row, null]] } })[0]).toEqual({ time: T, open: 180, high: 181, low: 179.5, close: 180.5, volume: 1000 });
    expect(CANDLE_SOURCES.zerodha!.parse({ status: "success", data: { candles: [["2026-10-05T10:10:00+0530", 180, 181, 179.5, 180.5, 1000]] } })[0].time).toBe(T);
    expect(CANDLE_SOURCES.upstox!.parse({ status: "success", data: { candles: [["2026-10-05T10:11:00+05:30", 1, 1, 1, 1, 1, 0], ["2026-10-05T10:10:00+05:30", 1, 1, 1, 1, 1, 0]] } }).map((c) => c.time)).toEqual([T, T + 60]); // newest first → sorted
    expect(CANDLE_SOURCES.fyers!.parse({ s: "ok", candles: [[T, 180, 181, 179.5, 180.5, 1000]] })[0].close).toBe(180.5);
    expect(CANDLE_SOURCES.angelone!.parse({ status: true, data: [["2026-10-05T10:10:00+05:30", 180, 181, 179.5, 180.5, 1000]] })[0].time).toBe(T);
    expect(CANDLE_SOURCES.dhan!.parse({ open: [180], high: [181], low: [179.5], close: [180.5], volume: [1000], timestamp: [T] })[0]).toEqual({ time: T, open: 180, high: 181, low: 179.5, close: 180.5, volume: 1000 });
    expect(CANDLE_SOURCES["5paisa"]!.parse({ data: { candles: [row] } })[0].time).toBe(T);
  });
  it("an empty or unexpected answer gives no candles, not an error", () => {
    for (const s of Object.values(CANDLE_SOURCES)) expect(s!.parse({})).toEqual([]);
  });
});
