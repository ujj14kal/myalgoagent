import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { bollingerBands, rsi, vwap } from "@/lib/indicators";
import { bollingerBandwidth, bollingerPercentB, bollingerSqueeze, changeOver, fibonacciLevels, keltnerSqueeze, sessionDay, sessionVwap } from "@/lib/indicators-study";

// Checks against the analyst studies (Logics folder): values worked out by hand from the formulas in each study.

const c = (time: number, close: number, volume = 100, high = close, low = close): Candle => ({ time, open: close, high, low, close, volume });
const DAY = 86_400;
// 2026-10-12 04:00 UTC = 09:30 IST (inside the NSE session).
const T0 = Date.UTC(2026, 9, 12, 4, 0, 0) / 1000;

describe("RSI (RSI study)", () => {
  it("is 100 when there are no losses and keeps the previous reading on a perfectly flat price", () => {
    const rising = Array.from({ length: 20 }, (_, i) => c(i, 100 + i));
    expect(rsi(rising, 14).at(-1)!.value).toBe(100);
    const flat = Array.from({ length: 20 }, (_, i) => c(i, 100));
    expect(rsi(flat, 14).every((p) => p.value === 50)).toBe(true);
    const risesThenFlat = [...rising, ...Array.from({ length: 5 }, (_, i) => c(20 + i, 119))];
    const out = rsi(risesThenFlat, 14);
    expect(out.every((p) => Number.isFinite(p.value))).toBe(true); // never a NaN or a blank on flat stretches
  });
});

describe("Bollinger extras (Bollinger study)", () => {
  const closes = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17];
  const candles = closes.map((x, i) => c(i, x));
  it("%B = (close - lower) / (upper - lower)", () => {
    const b = bollingerBands(candles, 5, 2);
    const pb = bollingerPercentB(candles, 5, 2);
    const i = b.upper.length - 1;
    expect(pb.at(-1)!.value).toBeCloseTo((closes.at(-1)! - b.lower[i].value) / (b.upper[i].value - b.lower[i].value), 10);
  });
  it("bandwidth = (upper - lower) / middle x 100, and a flat price gives no %B (no division by zero)", () => {
    const b = bollingerBands(candles, 5, 2);
    const i = b.upper.length - 1;
    expect(bollingerBandwidth(candles, 5, 2).at(-1)!.value).toBeCloseTo(((b.upper[i].value - b.lower[i].value) / b.middle[i].value) * 100, 10);
    const flat = Array.from({ length: 10 }, (_, k) => c(k, 50));
    expect(bollingerPercentB(flat, 5, 2)).toEqual([]);
  });
  it("squeeze is 1 only when bandwidth is among the lowest percent of the lookback, and needs the full lookback", () => {
    // Wide swings, then a long quiet stretch: the quiet end is the narrowest of the lookback.
    const wide = Array.from({ length: 40 }, (_, i) => c(i, 100 + (i % 2 === 0 ? 8 : -8)));
    const quiet = Array.from({ length: 30 }, (_, i) => c(40 + i, 100 + (i % 2 === 0 ? 0.2 : -0.2)));
    const sq = bollingerSqueeze([...wide, ...quiet], 10, 2, 40, 15);
    expect(sq.at(-1)!.value).toBe(1);
    expect(sq[0].value === 0 || sq[0].value === 1).toBe(true);
    expect(bollingerSqueeze([...wide].slice(0, 30), 10, 2, 40, 15)).toEqual([]);
  });
  it("Bollinger-inside-Keltner squeeze is a 0/1 flag", () => {
    const flags = keltnerSqueeze(Array.from({ length: 60 }, (_, i) => c(i, 100 + Math.sin(i), 100, 100 + Math.sin(i) + 1, 100 + Math.sin(i) - 1)), 20, 2, 1.5);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((p) => p.value === 0 || p.value === 1)).toBe(true);
  });
});

describe("Session VWAP (VWAP study)", () => {
  it("restarts every trading day (India calendar date) instead of running over the whole history", () => {
    const day1 = [c(T0, 100, 100), c(T0 + 300, 110, 100)];
    const day2 = [c(T0 + DAY, 200, 100), c(T0 + DAY + 300, 210, 100)];
    const v = vwap([...day1, ...day2]);
    expect(v[1].value).toBeCloseTo(105, 10); // (100*100 + 110*100) / 200
    expect(v[2].value).toBeCloseTo(200, 10); // reset: only day 2 counts
    expect(v[3].value).toBeCloseTo(205, 10);
  });
  it("a late-evening UTC time still belongs to the same Indian date (the session day is IST, not UTC)", () => {
    expect(sessionDay(Date.UTC(2026, 9, 12, 18, 0, 0) / 1000)).toBe(sessionDay(Date.UTC(2026, 9, 12, 4, 0, 0) / 1000)); // 23:30 IST and 09:30 IST
    expect(sessionDay(Date.UTC(2026, 9, 12, 19, 0, 0) / 1000)).toBe(sessionDay(Date.UTC(2026, 9, 12, 4, 0, 0) / 1000) + 1); // 00:30 IST next day
  });
  it("bands use the volume-weighted standard deviation of the typical price", () => {
    // Equal volume, typical prices 100 and 110: VWAP 105, variance 25, SD 5.
    const out = sessionVwap([c(T0, 100, 100), c(T0 + 300, 110, 100)]);
    expect(out.vwap[1].value).toBeCloseTo(105, 10);
    expect(out.upper1[1].value).toBeCloseTo(110, 10);
    expect(out.lower1[1].value).toBeCloseTo(100, 10);
    expect(out.upper2[1].value).toBeCloseTo(115, 10);
    expect(out.lower2[1].value).toBeCloseTo(95, 10);
  });
  it("on daily candles each candle is its own session, so VWAP is just the typical price", () => {
    const daily = [c(T0, 100, 500, 104, 98), c(T0 + DAY, 110, 500, 114, 108)];
    const v = vwap(daily);
    expect(v[0].value).toBeCloseTo((104 + 98 + 100) / 3, 10);
    expect(v[1].value).toBeCloseTo((114 + 108 + 110) / 3, 10);
  });
});

describe("Change over N bars", () => {
  it("is the value now minus the value N bars ago", () => {
    const pts = [1, 4, 9, 16].map((value, i) => ({ time: i, value }));
    expect(changeOver(pts, 1).map((p) => p.value)).toEqual([3, 5, 7]);
    expect(changeOver(pts, 2).map((p) => p.value)).toEqual([8, 12]);
  });
});

describe("Fibonacci levels (Fibonacci study)", () => {
  // A clean up-swing 100 -> 200 over 20 bars (a pivot low at the start and a pivot high at the end), then a pullback.
  const swingUp = (): Candle[] => {
    const out: Candle[] = [];
    for (let i = 0; i < 6; i++) out.push(c(i, 110 - i, 100, 110 - i + 1, 110 - i - 1)); // falling into the low
    out.push(c(6, 101, 100, 102, 100)); // pivot low = 100
    for (let i = 7; i <= 22; i++) out.push(c(i, 100 + (i - 6) * 6, 100, 100 + (i - 6) * 6 + 1, 100 + (i - 6) * 6 - 1));
    out.push(c(23, 199, 100, 200, 198)); // pivot high = 200
    for (let i = 24; i < 32; i++) out.push(c(i, 190 - (i - 24) * 2, 100, 192 - (i - 24) * 2, 188 - (i - 24) * 2)); // pullback
    return out;
  };
  it("computes the study's worked example: low 100, high 200 -> 38.2% = 161.8, 50% = 150, 61.8% = 138.2, 78.6% = 121.4", () => {
    const candles = swingUp();
    const f = fibonacciLevels(candles, 3, 3, 1);
    const last = (s: { value: number }[]) => s.at(-1)!.value;
    expect(last(f.ret382)).toBeCloseTo(161.8, 1);
    expect(last(f.ret500)).toBeCloseTo(150, 1);
    expect(last(f.ret618)).toBeCloseTo(138.2, 1);
    expect(last(f.ret786)).toBeCloseTo(121.4, 1);
    expect(last(f.ext1272)).toBeCloseTo(227.2, 1);
    expect(last(f.ext1618)).toBeCloseTo(261.8, 1);
    expect(last(f.direction)).toBe(1);
  });
  it("never uses a swing before it is confirmed (levels appear only `right` bars after the pivot high)", () => {
    const candles = swingUp();
    const f = fibonacciLevels(candles, 3, 3, 1);
    const firstTime = f.ret500[0].time;
    // pivot high is bar 23; confirmed at bar 26.
    expect(firstTime).toBeGreaterThanOrEqual(26);
  });
  it("is void once a candle closes beyond the swing start", () => {
    const candles = [...swingUp(), c(32, 95, 100, 96, 90), c(33, 90, 100, 92, 88)];
    const f = fibonacciLevels(candles, 3, 3, 1);
    expect(f.ret500.at(-1)!.time).toBeLessThan(32);
  });
  it("flags the golden zone when price pulls back into 50%-61.8%", () => {
    const candles = [...swingUp(), c(32, 145, 100, 150, 140)];
    const f = fibonacciLevels(candles, 3, 3, 1);
    expect(f.goldenZone.at(-1)!.value).toBe(1);
  });
  it("returns nothing for too little data", () => {
    expect(fibonacciLevels([c(0, 1), c(1, 2)], 5, 5, 3).ret500).toEqual([]);
  });
});

describe("Opening range", () => {
  // 2026-10-12: 09:15 IST = 03:45 UTC.
  const open = Date.UTC(2026, 9, 12, 3, 45, 0) / 1000;
  const bar = (min: number, high: number, low: number) => ({ time: open + min * 60, open: low, high, low, close: high, volume: 100 });
  it("is the high and low of the first 15 minutes, known only once those minutes are over", async () => {
    const { openingRange } = await import("@/lib/indicators-study");
    const bars = [bar(0, 105, 100), bar(5, 108, 102), bar(10, 107, 101), bar(15, 120, 110), bar(30, 90, 80)];
    const hi = openingRange(bars, 15, "high");
    const lo = openingRange(bars, 15, "low");
    expect(hi.map((p) => p.value)).toEqual([108, 108]);
    expect(lo.map((p) => p.value)).toEqual([100, 100]);
    expect(hi[0].time).toBe(open + 15 * 60); // first value on the candle after the range closes
  });
  it("restarts every day and has no range on daily candles", async () => {
    const { openingRange } = await import("@/lib/indicators-study");
    const next = 86_400;
    const bars = [bar(0, 105, 100), bar(15, 110, 104), { ...bar(0, 205, 200), time: open + next }, { ...bar(15, 210, 204), time: open + next + 900 }];
    const hi = openingRange(bars, 15, "high");
    expect(hi.map((p) => p.value)).toEqual([105, 205]);
    const daily = [{ time: open - 3 * 3600, open: 1, high: 5, low: 1, close: 4, volume: 1 }]; // 06:15 IST: before the open
    expect(openingRange(daily, 15, "high")).toEqual([]);
  });
});
