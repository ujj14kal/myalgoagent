import { describe, expect, it } from "vitest";
import { chooseExpiry, optionSymbol, parseContracts, simulateDay, strikeAt, summarizeOptionBacktest, weekdayOf, type DayTrade } from "./backtest-engine";

const ist = (s: string) => Date.parse(`${s}+05:30`) / 1000;
const bar = (t: string, o: number, c = o) => ({ time: ist(`2026-09-29T${t}:00`), open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1 });

describe("contracts", () => {
  const c = parseContracts(["NIFTY26100622700CE", "NIFTY26100622750PE", "NIFTY26101322700CE", "BANKNIFTY26102754000CE", "NIFTYNXT50261027100CE", "RELIANCE2610271400CE", "NIFTY26OCTFUT"], "NIFTY");
  it("reads expiries and strikes for exactly this underlying", () => {
    expect([...c.keys()]).toEqual(["2026-10-06", "2026-10-13"]);
    expect(c.get("2026-10-06")).toEqual([22700, 22750]);
  });
  it("picks the expiry by rule", () => {
    const ex = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"];
    expect(chooseExpiry("2026-10-06", ex, "WEEKLY_CURRENT")).toBe("2026-10-06");
    expect(chooseExpiry("2026-10-07", ex, "WEEKLY_NEXT")).toBe("2026-10-20");
    expect(chooseExpiry("2026-10-07", ex, "MONTHLY")).toBe("2026-10-27");
  });
  it("finds ATM and offsets by listed strikes", () => {
    expect(strikeAt([22600, 22650, 22700, 22750, 22800], 22688, 0)).toEqual({ atm: 22700, strike: 22700 });
    expect(strikeAt([22600, 22650, 22700, 22750, 22800], 22688, -2)).toEqual({ atm: 22700, strike: 22600 });
    expect(strikeAt([22600, 22650], 22688, 3)).toBeNull();
  });
  it("builds exchange symbols", () => {
    expect(optionSymbol("NIFTY", "2026-10-06", 22700, "CE")).toBe("NIFTY26100622700CE");
    expect(weekdayOf("2026-09-29")).toBe(2); // Tuesday
  });
});

describe("simulateDay", () => {
  const cfg = { entryMinute: 9 * 60 + 20, exitMinute: 15 * 60 + 15, stopLossUnit: null, stopLossValue: null, targetUnit: null, targetValue: null };
  const noCosts = { brokeragePerOrder: 0, slippagePct: 0 };
  const straddle = (ce: ReturnType<typeof bar>[], pe: ReturnType<typeof bar>[]) => ({
    date: "2026-09-29",
    expiry: "2026-10-06",
    spot: 22700,
    atm: 22700,
    legs: [
      { leg: { type: "CE" as const, side: "SELL" as const, offset: 0, lots: 1 }, symbol: "NIFTY26100622700CE", strike: 22700, bars: ce },
      { leg: { type: "PE" as const, side: "SELL" as const, offset: 0, lots: 1 }, symbol: "NIFTY26100622700PE", strike: 22700, bars: pe },
    ],
  });

  it("sells at entry and squares off at the exit minute", () => {
    const t = simulateDay(straddle([bar("09:20", 100), bar("15:15", 80)], [bar("09:20", 90), bar("15:15", 70)]), cfg, noCosts, 65)!;
    expect(t.premium).toBe(190 * 65);
    expect(t.exitReason).toBe("TIME");
    expect(t.grossPnl).toBe(40 * 65);
  });

  it("stops out on the combined loss at that minute's close", () => {
    const ce = [bar("09:20", 100), bar("10:00", 100, 150), bar("15:15", 50)];
    const pe = [bar("09:20", 90), bar("15:15", 40)];
    const t = simulateDay(straddle(ce, pe), { ...cfg, stopLossUnit: "RUPEES", stopLossValue: 3000 }, noCosts, 65)!;
    expect(t.exitReason).toBe("STOP_LOSS");
    expect(t.exitMinute).toBe(600);
    expect(t.grossPnl).toBe(-50 * 65);
    expect(t.trough).toBe(-50 * 65);
  });

  it("takes a target as % of premium and charges costs and slippage", () => {
    const t = simulateDay(straddle([bar("09:20", 100), bar("11:00", 50)], [bar("09:20", 100), bar("11:00", 100)]), { ...cfg, targetUnit: "PREMIUM_PCT", targetValue: 20 }, { brokeragePerOrder: 20, slippagePct: 1 }, 1)!;
    expect(t.exitReason).toBe("TARGET");
    expect(t.costs).toBe(80);
    // Sold at 99 + 99, bought back at 50.5 + 101.
    expect(t.grossPnl).toBeCloseTo(99 - 50.5 + 99 - 101);
  });

  it("skips the day when a leg has no price at entry", () => {
    expect(simulateDay(straddle([bar("09:30", 100)], [bar("09:20", 90)]), cfg, noCosts, 65)).toBeNull();
  });
});

describe("summarizeOptionBacktest", () => {
  const t = (date: string, netPnl: number) => ({ date, netPnl, exitReason: "TIME" }) as DayTrade;
  it("computes win rate, drawdown and equity", () => {
    const s = summarizeOptionBacktest([t("2026-09-28", 1000), t("2026-09-29", -1500), t("2026-09-30", 700)]);
    expect(s).toMatchObject({ days: 3, wins: 2, netPnl: 200, maxDrawdown: 1500, profitFactor: 1.13, bestDay: 1000, worstDay: -1500 });
    expect(s.equity.map((e) => e.value)).toEqual([1000, -500, 200]);
    expect(s.byWeekday.find((w) => w.weekday === 2)).toEqual({ weekday: 2, days: 1, netPnl: -1500 });
  });
});
