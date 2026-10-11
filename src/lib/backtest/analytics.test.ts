import { describe, expect, it } from "vitest";
import { calendarMonths, dayResults, drawdownSeries, monthlyReturns, pnlDistribution, summarize } from "./analytics";

const DAY = 86400;
// 2026-01-05 00:00 IST is a Monday.
const T0 = Date.UTC(2026, 0, 5) / 1000 - 19800;
const trade = (dayOffset: number, netPnl: number) => ({ exitTime: T0 + dayOffset * DAY + 3600, netPnl, netPnlPct: netPnl / 1000 });

describe("dayResults / summarize", () => {
  const trades = [trade(0, 100), trade(0, -30), trade(1, -50), trade(2, 20), trade(3, 40), trade(4, -10)];
  it("sums trades into days", () => {
    expect(dayResults(trades).map((d) => d.pnl)).toEqual([70, -50, 20, 40, -10]);
  });
  it("counts days, trades, streaks and extremes", () => {
    const s = summarize(trades, [{ time: T0, equity: 1000 }, { time: T0 + DAY, equity: 1070 }, { time: T0 + 2 * DAY, equity: 1020 }, { time: T0 + 3 * DAY, equity: 1100 }]);
    expect(s).toMatchObject({ tradingDays: 5, winDays: 3, lossDays: 2, totalTrades: 6, winTrades: 3, lossTrades: 3, bestTrade: 100, worstTrade: -50, bestDay: 70, worstDay: -50, longestWinStreak: 2, longestLossStreak: 1 });
    expect(s.maxDrawdown).toBe(50);
    expect(s.maxDrawdownPct).toBeCloseTo(4.67, 1);
  });
  it("copes with no trades", () => {
    expect(summarize([], [])).toMatchObject({ tradingDays: 0, totalTrades: 0, bestTrade: 0, maxDrawdown: 0 });
  });
});

describe("drawdownSeries", () => {
  it("measures the fall from the highest point so far", () => {
    expect(drawdownSeries([{ time: 1, equity: 100 }, { time: 2, equity: 90 }, { time: 3, equity: 120 }, { time: 4, equity: 114 }]).map((p) => p.drawdown)).toEqual([0, 10, 0, 6]);
  });
});

describe("calendarMonths", () => {
  it("lays days out from the weekday the month starts on", () => {
    const [jan] = calendarMonths(dayResults([trade(0, 100), trade(3, -20)]));
    expect(jan.label).toMatch(/Jan 2026/);
    expect(jan.pnl).toBe(80);
    // 1 Jan 2026 is a Thursday: four blanks, then the days.
    expect(jan.cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(jan.cells[4]).toEqual({ day: 1, pnl: null });
    expect(jan.cells.find((c) => c?.day === 5)?.pnl).toBe(100);
    expect(jan.cells.find((c) => c?.day === 8)?.pnl).toBe(-20);
    expect(jan.cells.filter(Boolean)).toHaveLength(31);
  });
});

describe("monthlyReturns", () => {
  it("gives each month's change and the year's compounded total", () => {
    const eq = [
      { time: Date.UTC(2026, 0, 10) / 1000, equity: 1000 },
      { time: Date.UTC(2026, 0, 28) / 1000, equity: 1100 },
      { time: Date.UTC(2026, 1, 15) / 1000, equity: 1210 },
    ];
    const [row] = monthlyReturns(eq);
    expect(row.year).toBe(2026);
    expect(row.months[0]).toBe(10);
    expect(row.months[1]).toBe(10);
    expect(row.total).toBeCloseTo(21, 5);
  });
});

describe("pnlDistribution", () => {
  it("counts every trade into a bucket", () => {
    const b = pnlDistribution([trade(0, -10), trade(1, 0), trade(2, 10), trade(3, 10)], 4);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(4);
    expect(b[0].count).toBe(1);
    expect(b[3].count).toBe(2);
  });
  it("handles identical results", () => {
    expect(pnlDistribution([trade(0, 5), trade(1, 5)])).toEqual([{ from: 5, to: 5, count: 2 }]);
  });
});
