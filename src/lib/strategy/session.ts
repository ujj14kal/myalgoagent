import { clampRangeForInterval, isIntraday, type CandleInterval, type CandleRange, type HistoryDepth } from "@/lib/market-data";
import type { EntryOrder, IntradaySession } from "@/lib/trading-engine/step";
import type { ConditionNode, FeasibilityIssue } from "./types";

// A strategy's timeframe and intraday session rules, in one place, so saving,
// validation, backtests, forward testing and the builder's demo all agree.

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

/** INTRADAY = squared off the same day; DELIVERY = may be held overnight (long only). MTF: coming later, per broker. */
export type ProductType = "INTRADAY" | "DELIVERY";
export type OrderType = "MARKET" | "LIMIT";
export type LimitMode = "PERCENT" | "PRICE";

export type SessionSettings = {
  timeframe: CandleInterval;
  noEntryAfterMinute: number | null;
  squareOffMinute: number | null;
  productType: ProductType;
  orderType: OrderType;
  limitMode: LimitMode | null;
  limitValue: number | null;
};

type SessionInput = {
  mode?: string;
  timeframe?: string | null;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
  productType?: string | null;
  orderType?: string | null;
  limitMode?: string | null;
  limitValue?: number | null;
};

/** The product a strategy gets when none is chosen: intraday timeframes → Intraday, daily → Delivery. */
export function defaultProduct(timeframe: string): ProductType {
  return isIntraday(timeframe as CandleInterval) ? "INTRADAY" : "DELIVERY";
}

/**
 * What gets saved. Daily and webhook strategies carry no time-of-day rules;
 * only Intraday products square off; a market order carries no limit.
 */
export function normalizeSession(input: SessionInput): SessionSettings {
  const tf = (input.mode === "WEBHOOK" ? "1d" : input.timeframe || "1d") as CandleInterval;
  const intradayTf = isIntraday(tf);
  const productType: ProductType = input.productType === "INTRADAY" || input.productType === "DELIVERY" ? input.productType : defaultProduct(tf);
  const orderType: OrderType = input.mode !== "WEBHOOK" && input.orderType === "LIMIT" ? "LIMIT" : "MARKET";
  return {
    timeframe: tf,
    noEntryAfterMinute: intradayTf ? input.noEntryAfterMinute ?? null : null,
    squareOffMinute: intradayTf && productType === "INTRADAY" ? input.squareOffMinute ?? null : null,
    productType,
    orderType,
    limitMode: orderType === "LIMIT" ? (input.limitMode === "PRICE" ? "PRICE" : "PERCENT") : null,
    limitValue: orderType === "LIMIT" ? input.limitValue ?? null : null,
  };
}

/** The engine's entry order config. */
export function engineEntryOrder(s: { orderType: string; limitMode: string | null; limitValue: number | null }): EntryOrder {
  if (s.orderType !== "LIMIT" || s.limitValue == null) return { type: "MARKET" };
  return { type: "LIMIT", mode: s.limitMode === "PRICE" ? "PRICE" : "PERCENT", value: s.limitValue };
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
  s: { timeframe: string; noEntryAfterMinute: number | null; squareOffMinute: number | null; productType?: string | null },
  entryCondition?: ConditionNode,
): IntradaySession | undefined {
  if (!isIntraday(s.timeframe as CandleInterval)) return undefined;
  const intradayProduct = (s.productType ?? defaultProduct(s.timeframe)) === "INTRADAY";
  return {
    noEntryAfterMinute: s.noEntryAfterMinute,
    squareOffMinute: intradayProduct ? s.squareOffMinute : null,
    allowOpeningEntry: entryTargetsOpen(entryCondition),
    flatOvernight: intradayProduct,
  };
}

/** The history window used for a run on this timeframe (limited by what the data source keeps). */
export function rangeFor(timeframe: string, desired: CandleRange, depth: HistoryDepth = "standard"): CandleRange {
  return clampRangeForInterval(desired, timeframe as CandleInterval, depth);
}

/** Enough recent history for a forward-testing sync: indicators need warm-up bars before the new ones. */
export function paperSyncRange(timeframe: string, depth: HistoryDepth = "standard"): CandleRange {
  return isIntraday(timeframe as CandleInterval) ? rangeFor(timeframe, "1mo", depth) : "3mo";
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
  s: SessionSettings & { valid: boolean; direction?: string; requestedProduct?: string | null },
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
  if (s.requestedProduct === "MTF") {
    issues.push({ section: "positionSizing", message: "MTF (margin) orders are coming soon — terms differ by broker, so they'll arrive with broker integration. Choose Intraday or Delivery for now." });
  }
  if (s.productType === "INTRADAY" && !isIntraday(s.timeframe)) {
    issues.push({ section: "positionSizing", message: "An Intraday product needs an intraday timeframe (1m to 4H) so positions can be squared off the same day. Choose a shorter timeframe, or Delivery." });
  }
  if (s.productType === "DELIVERY" && s.direction === "SHORT") {
    issues.push({ section: "positionSizing", message: "Short positions can't be held overnight in the cash market, so Delivery is long-only. Choose Intraday (on an intraday timeframe) to trade short." });
  }
  if (s.orderType === "LIMIT") {
    const v = s.limitValue;
    if (v == null || !Number.isFinite(v) || v <= 0) {
      issues.push({ section: "positionSizing", message: "Enter the limit: a % away from the signal price, or a price in ₹." });
    } else if (s.limitMode === "PERCENT" && v > 20) {
      issues.push({ section: "positionSizing", message: "A limit more than 20% away from the signal price would almost never fill. Use a smaller %." });
    }
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

/** Normalised settings plus what's needed to validate them (the raw timeframe/product, the direction). */
export function sessionFromInput(input: SessionInput & { direction?: string }) {
  const valid = input.timeframe == null || input.timeframe === "" || STRATEGY_TIMEFRAMES.some((t) => t.value === input.timeframe);
  return { ...normalizeSession(input), valid, direction: input.direction, requestedProduct: input.productType ?? null };
}
