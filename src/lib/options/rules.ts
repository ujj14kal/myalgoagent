import type { Candle } from "@/lib/market-data";
import { conditionTruthPerBar } from "@/lib/strategy/evaluate";
import type { ConditionNode } from "@/lib/strategy/types";
import { istDateOf, istMinuteOf, type Side } from "./backtest-engine";

// Optional entry and exit rules for an options strategy, built from the same conditions as a regular strategy.
// They are read on one of two charts:
//   FUTURE — the underlying's own chart (NIFTY, BANKNIFTY…), with a few days of history so indicators have a warm-up;
//   OPTION — the strategy's combined premium (what the legs together cost or pay), which follows the options maths:
//            time decay, volatility and the strike's distance from spot. Only the trading day's own candles exist for it,
//            because the strikes are picked fresh each day, so long indicators have less to work with.
// A rule fires on a candle's close; the trade acts at the next candle's open, never inside the candle that produced the signal.

export type RuleChart = "FUTURE" | "OPTION";
export const RULE_TIMEFRAMES = [1, 3, 5, 15] as const;
export type RuleTimeframe = (typeof RULE_TIMEFRAMES)[number];

export type OptionRules = {
  chart: RuleChart;
  /** Candle size in minutes the rules are read on. */
  timeframe: RuleTimeframe;
  /** Enter when this becomes true (from the strategy's entry time until `lastEntryMinute`); null = enter at the entry time. */
  entry: ConditionNode | null;
  /** Leave early when this becomes true; null = only the stop-loss, target and square-off time end the trade. */
  exit: ConditionNode | null;
  /** Latest IST minute of day an entry is taken (a rule that never fires that day means no trade). */
  lastEntryMinute: number;
};

export const DEFAULT_LAST_ENTRY = 15 * 60;

/** Candles of `minutes` minutes from 1-minute candles, bucketed on the IST clock within each day. */
export function aggregateBars(bars: Candle[], minutes: number): Candle[] {
  if (minutes <= 1) return bars;
  const out: Candle[] = [];
  let key = "";
  for (const b of bars) {
    const m = istMinuteOf(b.time);
    const bucket = Math.floor(m / minutes) * minutes;
    const k = `${istDateOf(b.time)}-${bucket}`;
    const last = out.at(-1);
    if (k === key && last) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else {
      key = k;
      out.push({ time: b.time - (m - bucket) * 60 - (b.time % 60), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
  }
  return out;
}

/** The legs' combined premium per minute: sold legs count as received (+), bought legs as paid (−), forward-filled across gaps. */
export function premiumSeries(legs: { side: Side; lots: number; bars: Candle[] }[]): Candle[] {
  const times = [...new Set(legs.flatMap((l) => l.bars.map((b) => b.time)))].sort((a, b) => a - b);
  const idx = legs.map(() => 0);
  const last = legs.map(() => null as number | null);
  const out: Candle[] = [];
  for (const t of times) {
    legs.forEach((l, k) => {
      while (idx[k] < l.bars.length && l.bars[idx[k]].time <= t) last[k] = l.bars[idx[k]++].close;
    });
    if (last.some((v) => v === null)) continue;
    const net = legs.reduce((s, l, k) => s + (l.side === "SELL" ? 1 : -1) * last[k]! * l.lots, 0);
    out.push({ time: t, open: net, high: net, low: net, close: net, volume: 0 });
  }
  return out;
}

/**
 * The IST minute a trade acts at: the first candle at or after `fromMinute` whose rule is true is read at its close,
 * so the trade acts one candle later. Null when it never fires before `untilMinute`.
 */
export function firstRuleMinute(candles: Candle[], node: ConditionNode, date: string, timeframe: number, fromMinute: number, untilMinute: number): number | null {
  const truth = conditionTruthPerBar(candles, node);
  for (let i = 0; i < candles.length; i++) {
    if (!truth[i] || istDateOf(candles[i].time) !== date) continue;
    const start = istMinuteOf(candles[i].time);
    const acts = start + timeframe;
    if (acts < fromMinute) continue;
    if (acts > untilMinute) return null;
    return acts;
  }
  return null;
}

export function describeRules(r: OptionRules | null | undefined): string | null {
  if (!r || (!r.entry && !r.exit)) return null;
  const chart = r.chart === "FUTURE" ? "the underlying's chart" : "the strategy's combined option premium";
  return `Rules are read on ${chart}, on ${r.timeframe}-minute candles${r.entry ? "; entry waits for the entry rule" : ""}${r.exit ? "; the exit rule can close the trade early" : ""}.`;
}
