import { describe, expect, it } from "vitest";
import { windows, groupDaily, lastTradingDays, parseBarsCsv, rangeStart, sessionOnly, toTrueDataSymbol, toTrueDataTime } from "./truedata";

const ist = (s: string) => Date.parse(`${s}+05:30`) / 1000;

describe("toTrueDataSymbol", () => {
  it("maps NSE stocks and known indices, rejects the rest", () => {
    expect(toTrueDataSymbol("RELIANCE.NS")).toBe("RELIANCE");
    expect(toTrueDataSymbol("m&m.ns")).toBe("M&M");
    expect(toTrueDataSymbol("BAJAJ-AUTO.NS")).toBe("BAJAJ-AUTO");
    expect(toTrueDataSymbol("^NSEI")).toBe("NIFTY 50");
    expect(toTrueDataSymbol("^NSEBANK")).toBe("NIFTY BANK");
    expect(toTrueDataSymbol("500325.BO")).toBeNull();
    expect(toTrueDataSymbol("AAPL")).toBeNull();
  });
});

describe("toTrueDataTime", () => {
  it("formats IST yymmddTHH:mm:ss", () => {
    expect(toTrueDataTime(ist("2026-09-29T09:15:00"))).toBe("260929T09:15:00");
    expect(toTrueDataTime(ist("2026-01-05T15:30:07"))).toBe("260105T15:30:07");
  });
});

describe("rangeStart", () => {
  const now = ist("2026-09-29T12:00:00");
  it("goes back by calendar months/years in IST", () => {
    expect(toTrueDataTime(rangeStart("1mo", now))).toBe("260829T12:00:00");
    expect(toTrueDataTime(rangeStart("1y", now))).toBe("250929T12:00:00");
    expect(toTrueDataTime(rangeStart("ytd", now))).toBe("260101T00:00:00");
  });
  it("reaches past weekends for 1d/5d", () => {
    expect(now - rangeStart("1d", now)).toBeGreaterThanOrEqual(4 * 86400);
    expect(now - rangeStart("5d", now)).toBeGreaterThanOrEqual(9 * 86400);
  });
});

describe("parseBarsCsv", () => {
  it("parses by header, in either column order", () => {
    const a = parseBarsCsv("timestamp,open,high,low,close,volume,oi\n2026-09-28T09:15,10,12,9,11,500,0\n", false);
    const b = parseBarsCsv("timestamp,open,high,low,close,oi,volume\r\n2026-09-28T09:15:00,10,12,9,11,0,500", false);
    expect(a).toEqual([{ time: ist("2026-09-28T09:15:00"), open: 10, high: 12, low: 9, close: 11, volume: 500 }]);
    expect(b).toEqual(a);
  });
  it("stamps daily candles at the 09:15 IST open and sorts", () => {
    const c = parseBarsCsv("timestamp,open,high,low,close,volume\n2026-09-28,1,1,1,1,1\n2026-09-25T00:00:00,2,2,2,2,2", true);
    expect(c.map((x) => x.time)).toEqual([ist("2026-09-25T09:15:00"), ist("2026-09-28T09:15:00")]);
  });
  it("treats 'No data exists' as empty and other replies as errors", () => {
    expect(parseBarsCsv("No data exists for RELIANCE", false)).toEqual([]);
    expect(() => parseBarsCsv("Symbol does not exist", false)).toThrow(/Symbol does not exist/);
  });
});

describe("session and day trimming", () => {
  const bar = (t: string) => ({ time: ist(t), open: 1, high: 1, low: 1, close: 1, volume: 1 });
  it("drops pre-open and post-close bars", () => {
    const out = sessionOnly([bar("2026-09-28T09:07:00"), bar("2026-09-28T09:15:00"), bar("2026-09-28T15:29:00"), bar("2026-09-28T15:30:00")]);
    expect(out.map((c) => c.time)).toEqual([ist("2026-09-28T09:15:00"), ist("2026-09-28T15:29:00")]);
  });
  it("keeps the last N trading days", () => {
    const out = lastTradingDays([bar("2026-09-24T10:00:00"), bar("2026-09-25T10:00:00"), bar("2026-09-28T10:00:00"), bar("2026-09-28T11:00:00")], 2);
    expect(out).toHaveLength(3);
  });
});

describe("groupDaily", () => {
  const day = (d: string, o: number, h: number, l: number, c: number) => ({ time: ist(`${d}T09:15:00`), open: o, high: h, low: l, close: c, volume: 10 });
  it("builds Monday-start weeks", () => {
    const out = groupDaily([day("2026-09-24", 1, 5, 1, 2), day("2026-09-25", 2, 6, 0, 3), day("2026-09-28", 3, 4, 2, 4)], "week");
    expect(out).toEqual([
      { time: ist("2026-09-24T09:15:00"), open: 1, high: 6, low: 0, close: 3, volume: 20 },
      { time: ist("2026-09-28T09:15:00"), open: 3, high: 4, low: 2, close: 4, volume: 10 },
    ]);
  });
  it("builds calendar months", () => {
    const out = groupDaily([day("2026-08-31", 1, 2, 1, 2), day("2026-09-01", 2, 3, 2, 3), day("2026-09-30", 3, 9, 1, 8)], "month");
    expect(out.map((c) => [c.open, c.high, c.low, c.close])).toEqual([[1, 2, 1, 2], [2, 9, 1, 8]]);
  });
});

describe("windows", () => {
  it("covers the span in consecutive, non-overlapping chunks", () => {
    expect(windows(0, 25, 10)).toEqual([[0, 9], [10, 19], [20, 25]]);
    expect(windows(0, 5, 10)).toEqual([[0, 5]]);
    expect(windows(5, 5, 10)).toEqual([]);
  });
});
