import { describe, expect, it } from "vitest";
import { closedCandles } from "./sync";

// 2026-09-28 is a Monday. IST = UTC+5:30.
const ist = (hhmm: string) => Math.floor(Date.parse(`2026-09-28T${hhmm}:00+05:30`) / 1000);

describe("closedCandles", () => {
  const five = [{ time: ist("10:00") }, { time: ist("10:05") }];
  it("drops a 5m candle that is still forming", () => {
    expect(closedCandles(five, "5m", ist("10:07"))).toHaveLength(1);
    expect(closedCandles(five, "5m", ist("10:10"))).toHaveLength(2);
  });
  it("closes the day's last intraday candle at 15:30", () => {
    const last = [{ time: ist("15:25") }];
    expect(closedCandles(last, "15m", ist("15:29"))).toHaveLength(0);
    expect(closedCandles(last, "15m", ist("15:30"))).toHaveLength(1);
  });
  it("treats today's daily candle as forming until 15:30 IST", () => {
    const daily = [{ time: ist("09:15") - 86_400 }, { time: ist("09:15") }];
    expect(closedCandles(daily, "1d", ist("13:00"))).toHaveLength(1);
    expect(closedCandles(daily, "1d", ist("15:31"))).toHaveLength(2);
  });
});

describe("crypto candles", () => {
  const t0 = 1_800_000_000;
  it("a 1h candle closes one hour after it opened, at any hour of the day", () => {
    const candles = [{ time: t0 }, { time: t0 + 3600 }];
    expect(closedCandles(candles, "60m", t0 + 3600 + 1800, true)).toHaveLength(1);
    expect(closedCandles(candles, "60m", t0 + 7200, true)).toHaveLength(2);
  });
  it("a daily candle closes after 24 hours, not at the stock market's close", () => {
    const candles = [{ time: t0 }];
    expect(closedCandles(candles, "1d", t0 + 3600, true)).toHaveLength(0);
    expect(closedCandles(candles, "1d", t0 + 86_400, true)).toHaveLength(1);
  });
});
