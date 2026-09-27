import { describe, expect, it } from "vitest";
import { checkSessionFeasibility, engineSession, normalizeSession, paperSyncRange, rangeFor, sessionFromInput } from "./session";
import type { ConditionNode } from "./types";

const timeRule: ConditionNode = { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 570 } };
const patternInWindow: ConditionNode = { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "HAMMER", window: { startMinute: 600, endMinute: 690 } } };

describe("strategy session settings", () => {
  it("daily and webhook strategies never keep session rules", () => {
    expect(normalizeSession({ timeframe: "1d", noEntryAfterMinute: 870, squareOffMinute: 920 })).toEqual({ timeframe: "1d", noEntryAfterMinute: null, squareOffMinute: null });
    expect(normalizeSession({ mode: "WEBHOOK", timeframe: "5m", squareOffMinute: 920 }).timeframe).toBe("1d");
    expect(engineSession({ timeframe: "1d", noEntryAfterMinute: null, squareOffMinute: null })).toBeUndefined();
    expect(engineSession({ timeframe: "15m", noEntryAfterMinute: 870, squareOffMinute: 920 })).toEqual({ noEntryAfterMinute: 870, squareOffMinute: 920, allowOpeningEntry: false });
  });

  it("flags time-of-day rules on a daily strategy, in entry and exit", () => {
    const s = sessionFromInput({ timeframe: "1d" });
    const issues = checkSessionFeasibility(s, timeRule, patternInWindow);
    expect(issues.map((i) => i.section)).toEqual(["entry", "exit"]);
    expect(checkSessionFeasibility(sessionFromInput({ timeframe: "5m" }), timeRule, patternInWindow)).toEqual([]);
  });

  it("checks session times", () => {
    expect(checkSessionFeasibility(sessionFromInput({ timeframe: "5m", squareOffMinute: 16 * 60 }), null, null)[0].section).toBe("risk");
    expect(checkSessionFeasibility(sessionFromInput({ timeframe: "5m", noEntryAfterMinute: 925, squareOffMinute: 920 }), null, null)).toHaveLength(1);
    expect(checkSessionFeasibility(sessionFromInput({ timeframe: "7m" }), null, null)[0].message).toMatch(/Choose a timeframe/);
  });

  it("clamps history to what each timeframe keeps", () => {
    expect(rangeFor("1m", "6mo")).toBe("5d");
    expect(rangeFor("15m", "1y")).toBe("1mo");
    expect(rangeFor("4h", "5y")).toBe("1y");
    expect(rangeFor("1d", "5y")).toBe("5y");
    expect(paperSyncRange("1d")).toBe("3mo");
    expect(paperSyncRange("5m")).toBe("1mo");
  });
});
