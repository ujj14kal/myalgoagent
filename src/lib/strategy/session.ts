import { clampRangeForInterval, isIntraday, type CandleInterval, type CandleRange } from "@/lib/market-data";
import type { IntradaySession } from "@/lib/trading-engine/step";
import type { ConditionNode, FeasibilityIssue } from "./types";

// A strategy's timeframe and intraday session rules, in one place, so saving,
// validation, backtests, paper trading and the builder's demo all agree.

/** Timeframes a strategy can run on (weekly/monthly are chart-only). */
export const STRATEGY_TIMEFRAMES: { value: CandleInterval; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "3m", label: "3m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "60m", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

export const SESSION_OPEN_MINUTE = 9 * 60 + 15; // 09:15 IST
export const SESSION_CLOSE_MINUTE = 15 * 60 + 30; // 15:30 IST
/** Brokers typically auto-square-off intraday positions around 15:20. */
export const DEFAULT_SQUARE_OFF_MINUTE = 15 * 60 + 20;

export type SessionSettings = { timeframe: CandleInterval; noEntryAfterMinute: number | null; squareOffMinute: number | null };

/** What gets saved: daily (and webhook) strategies never carry session rules. */
export function normalizeSession(input: {
  mode?: string;
  timeframe?: string | null;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
}): SessionSettings {
  const tf = (input.mode === "WEBHOOK" ? "1d" : input.timeframe || "1d") as CandleInterval;
  if (!isIntraday(tf)) return { timeframe: tf, noEntryAfterMinute: null, squareOffMinute: null };
  return { timeframe: tf, noEntryAfterMinute: input.noEntryAfterMinute ?? null, squareOffMinute: input.squareOffMinute ?? null };
}

/** Does the entry rule have a time window that starts at the market open ("enter at 09:15")? */
function entryTargetsOpen(node: ConditionNode | undefined): boolean {
  if (!node) return false;
  switch (node.kind) {
    case "group":
      return node.children.some(entryTargetsOpen);
    case "not":
      return false;
    case "signal":
      return node.signal.family === "TIME_WINDOW" && node.signal.startMinute <= SESSION_OPEN_MINUTE;
    default:
      return false;
  }
}

/** The engine's session config — undefined for daily strategies (no time-of-day rules). */
export function engineSession(
  s: { timeframe: string; noEntryAfterMinute: number | null; squareOffMinute: number | null },
  entryCondition?: ConditionNode,
): IntradaySession | undefined {
  if (!isIntraday(s.timeframe as CandleInterval)) return undefined;
  return { noEntryAfterMinute: s.noEntryAfterMinute, squareOffMinute: s.squareOffMinute, allowOpeningEntry: entryTargetsOpen(entryCondition) };
}

/** The history window used for a run on this timeframe (limited by what the data source keeps). */
export function rangeFor(timeframe: string, desired: CandleRange): CandleRange {
  return clampRangeForInterval(desired, timeframe as CandleInterval);
}

/** Enough recent history for a paper-trading sync: indicators need warm-up bars before the new ones. */
export function paperSyncRange(timeframe: string): CandleRange {
  return isIntraday(timeframe as CandleInterval) ? rangeFor(timeframe, "1mo") : "3mo";
}

export const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

function usesTimeOfDay(node: ConditionNode): boolean {
  switch (node.kind) {
    case "group":
      return node.children.some(usesTimeOfDay);
    case "not":
      return usesTimeOfDay(node.child);
    case "signal":
      return node.signal.family === "TIME_WINDOW" || (node.signal.family === "CANDLE_PATTERN" && !!node.signal.window);
    default:
      return false;
  }
}

/** Rules about the timeframe and session times that no condition-tree walk can catch on its own. */
export function checkSessionFeasibility(
  s: SessionSettings & { valid: boolean },
  entry: ConditionNode | null,
  exit: ConditionNode | null,
): FeasibilityIssue[] {
  const issues: FeasibilityIssue[] = [];
  if (!s.valid) {
    issues.push({ section: "positionSizing", message: `Choose a timeframe from ${STRATEGY_TIMEFRAMES.map((t) => t.label).join(", ")}.` });
    return issues;
  }
  const inSession = (m: number | null) => m === null || (Number.isInteger(m) && m > SESSION_OPEN_MINUTE && m <= SESSION_CLOSE_MINUTE);
  if (!inSession(s.noEntryAfterMinute)) {
    issues.push({ section: "risk", message: `"No new entries after" must be a time between ${clock(SESSION_OPEN_MINUTE)} and ${clock(SESSION_CLOSE_MINUTE)}.` });
  }
  if (!inSession(s.squareOffMinute)) {
    issues.push({ section: "risk", message: `The square-off time must be between ${clock(SESSION_OPEN_MINUTE)} and ${clock(SESSION_CLOSE_MINUTE)}.` });
  }
  if (s.noEntryAfterMinute !== null && s.squareOffMinute !== null && s.noEntryAfterMinute > s.squareOffMinute) {
    issues.push({ section: "risk", message: "The last entry time is after the square-off time, so those entries would close immediately. Set it earlier." });
  }
  if (!isIntraday(s.timeframe)) {
    if (entry && usesTimeOfDay(entry)) {
      issues.push({ section: "entry", message: "Time-of-day rules need an intraday timeframe (1m to 4H) — on daily candles every candle covers the whole day. Change the timeframe in Position." });
    }
    if (exit && usesTimeOfDay(exit)) {
      issues.push({ section: "exit", message: "Exit times need an intraday timeframe (1m to 4H) — on daily candles every candle covers the whole day. Change the timeframe in Position." });
    }
  }
  return issues;
}

/** Validates a raw timeframe string against the allowed list. */
export function sessionFromInput(input: { mode?: string; timeframe?: string | null; noEntryAfterMinute?: number | null; squareOffMinute?: number | null }) {
  const valid = input.timeframe == null || input.timeframe === "" || STRATEGY_TIMEFRAMES.some((t) => t.value === input.timeframe);
  return { ...normalizeSession(input), valid };
}
