import { describe, expect, it } from "vitest";
import type { Candle } from "./types";
import { fixedBucket, fourHourBucket, istDayAndMinute, resampleCandles } from "./resample";

// 2026-09-25 09:15 IST = 03:45 UTC
const DAY_OPEN = Date.UTC(2026, 8, 25, 3, 45) / 1000;
const bar = (minutesAfterOpen: number, o: number, h: number, l: number, c: number, v = 100): Candle => ({
  time: DAY_OPEN + minutesAfterOpen * 60,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
});

describe("resampleCandles", () => {
  it("builds 3-minute candles from 1-minute ones, aligned to 09:15", () => {
    const oneMinute = Array.from({ length: 7 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const three = resampleCandles(oneMinute, fixedBucket(3));
    expect(three).toHaveLength(3);
    expect(three.map((c) => istDayAndMinute(c.time).minute)).toEqual([555, 558, 561]); // 09:15, 09:18, 09:21
    expect(three[0]).toMatchObject({ open: 100, high: 103, low: 99, close: 102.5, volume: 300 });
    expect(three[2]).toMatchObject({ open: 106, close: 106.5, volume: 100 }); // partial last bucket
  });

  it("builds NSE 4-hour candles (09:15–13:15, 13:15–15:30) from hourly ones", () => {
    const hourly = Array.from({ length: 7 }, (_, i) => bar(i * 60, 200 + i, 205 + i, 195 + i, 201 + i)); // 09:15 … 15:15
    const four = resampleCandles(hourly, fourHourBucket);
    expect(four).toHaveLength(2);
    expect(four.map((c) => istDayAndMinute(c.time).minute)).toEqual([555, 795]);
    expect(four[0]).toMatchObject({ open: 200, high: 208, low: 195, close: 204, volume: 400 });
    expect(four[1]).toMatchObject({ open: 204, close: 207, volume: 300 });
  });

  it("never merges candles from different days", () => {
    const today = bar(0, 1, 1, 1, 1);
    const tomorrow = { ...bar(0, 2, 2, 2, 2), time: today.time + 86400 };
    expect(resampleCandles([today, tomorrow], fourHourBucket)).toHaveLength(2);
  });
});
