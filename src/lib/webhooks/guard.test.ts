import { describe, expect, it } from "vitest";
import { isTradingViewIp, sameCandle } from "./guard";

const ist = (s: string) => new Date(`${s}+05:30`);

describe("webhook guard", () => {
  it("accepts only TradingView's published IPs", () => {
    expect(isTradingViewIp("52.89.214.238")).toBe(true);
    expect(isTradingViewIp("52.32.178.7")).toBe(true);
    expect(isTradingViewIp("1.2.3.4")).toBe(false);
    expect(isTradingViewIp("unknown")).toBe(false);
  });
  it("allows one signal per candle of the strategy's timeframe", () => {
    expect(sameCandle(ist("2026-09-30T10:01:00"), ist("2026-09-30T10:14:00"), "15m")).toBe(true); // 10:00–10:15
    expect(sameCandle(ist("2026-09-30T10:14:00"), ist("2026-09-30T10:16:00"), "15m")).toBe(false);
    expect(sameCandle(ist("2026-09-30T09:20:00"), ist("2026-09-30T15:00:00"), "1d")).toBe(true);
    expect(sameCandle(ist("2026-09-30T15:00:00"), ist("2026-10-01T09:20:00"), "1d")).toBe(false);
  });
});
