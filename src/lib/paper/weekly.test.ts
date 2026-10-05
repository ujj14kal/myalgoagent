import { describe, expect, it } from "vitest";
import { closedCandles, findEntryIndex, snapFormingCandle } from "./sync";
import { paperSyncRange, STRATEGY_TIMEFRAMES, checkSessionFeasibility, sessionFromInput } from "@/lib/strategy/session";
import { tradingDaysBetween } from "@/lib/trading-engine/step";
import type { ConditionNode } from "@/lib/strategy/types";

// Weekly strategies: a weekly candle is stamped by its first session and is closed only once Friday's session ends.

const ist = (iso: string) => Math.floor(new Date(`${iso}+05:30`).getTime() / 1000);
const week = (mondayIso: string) => ({ time: ist(`${mondayIso}T09:15:00`), open: 1, high: 1, low: 1, close: 1, volume: 1 });

describe("weekly candles", () => {
  const weeks = [week("2026-09-14"), week("2026-09-21"), week("2026-09-28")]; // Mondays

  it("the latest week is not closed during the week, even on Friday before the close", () => {
    expect(closedCandles(weeks, "1wk", ist("2026-10-01T11:00:00"))).toHaveLength(2); // Thursday of the week of 28 Sep
    expect(closedCandles(weeks, "1wk", ist("2026-10-02T15:00:00"))).toHaveLength(2); // Friday, before 15:30
  });
  it("closes with Friday's session", () => {
    expect(closedCandles(weeks, "1wk", ist("2026-10-02T15:31:00"))).toHaveLength(3);
    expect(closedCandles(weeks, "1wk", ist("2026-10-05T09:00:00"))).toHaveLength(3); // the next Monday
  });
  it("a week that starts on a Tuesday (Monday was a holiday) still closes on its Friday", () => {
    const tue = [week("2026-09-14"), { ...week("2026-09-22") }];
    expect(closedCandles(tue, "1wk", ist("2026-09-25T15:00:00"))).toHaveLength(1);
    expect(closedCandles(tue, "1wk", ist("2026-09-25T16:00:00"))).toHaveLength(2);
  });
  it("a week after a holiday keeps its own stamp", () => {
    const after = [week("2026-09-14"), { ...week("2026-09-22") }];
    expect(snapFormingCandle(after, "1wk")).toBe(after);
  });
  it("the forming week Yahoo stamps with its latest trade time goes back to its Monday, the same way every pass", () => {
    const monday = (iso: string) => ({ time: ist(`${iso}T00:00:00`), open: 1, high: 1, low: 1, close: 1, volume: 1 });
    const prev = [monday("2026-09-21"), monday("2026-09-28")];
    const wed = { time: ist("2026-09-30T14:20:11"), open: 1, high: 1, low: 1, close: 1, volume: 1 };
    const fri = { time: ist("2026-10-02T15:29:58"), open: 1, high: 1, low: 1, close: 1, volume: 1 };
    const a = snapFormingCandle([...prev, { ...wed }], "1wk").at(-1)!;
    const b = snapFormingCandle([...prev, { ...fri }], "1wk").at(-1)!;
    expect(a.time).toBe(ist("2026-09-28T00:00:00"));
    expect(b.time).toBe(a.time);
  });
  it("a position's entry is found in the week that contains it", () => {
    expect(findEntryIndex(weeks, ist("2026-09-23T10:00:00"), "1wk")).toBe(1);
    expect(findEntryIndex(weeks, weeks[2].time, "1wk")).toBe(2);
  });
  it("syncs over years of weekly candles, so indicators have warmed up", () => {
    expect(paperSyncRange("1wk")).toBe("5y");
  });
});

describe("weekly strategies are allowed", () => {
  it("1W is a strategy timeframe", () => expect(STRATEGY_TIMEFRAMES.map((t) => t.value)).toContain("1wk"));
  it("weekly is delivery and has no time-of-day rules", () => {
    const s = sessionFromInput({ timeframe: "1wk", direction: "LONG" });
    expect(s.valid).toBe(true);
    expect(s.productType).toBe("DELIVERY");
    expect(checkSessionFeasibility(s, null, null)).toEqual([]);
    const tw: ConditionNode = { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 570 } };
    expect(checkSessionFeasibility(s, tw, null).map((i) => i.message).join(" ")).toMatch(/intraday timeframe/);
  });
  it("monthly still is not", () => expect(sessionFromInput({ timeframe: "1mo" }).valid).toBe(false));
});

describe("trading days between candles", () => {
  const day = (iso: string) => ({ time: ist(`${iso}T09:15:00`), open: 1, high: 1, low: 1, close: 1, volume: 1 });
  it("counts sessions, not calendar days: a weekend is one day", () => {
    const c = [day("2026-09-24"), day("2026-09-25"), day("2026-09-28"), day("2026-09-29")]; // Thu Fri Mon Tue
    expect(tradingDaysBetween(c, 0, 3)).toBe(3);
  });
  it("candles within a day count nothing extra", () => {
    const m = [ist("2026-09-28T09:15:00"), ist("2026-09-28T09:16:00"), ist("2026-09-29T09:15:00")].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(tradingDaysBetween(m, 0, 2)).toBe(1);
  });
  it("a weekly candle stands for five sessions", () => {
    const w = [week("2026-09-14"), week("2026-09-21"), week("2026-09-28")];
    expect(tradingDaysBetween(w, 0, 2)).toBe(10);
  });
});
