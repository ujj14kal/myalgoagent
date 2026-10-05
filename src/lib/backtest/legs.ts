import type { TradeLegs } from "./run";

// The parts of a backtest trade that was built or sold in stages, as saved on the trade.

export function parseTradeLegs(json: unknown): TradeLegs | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Partial<TradeLegs>;
  if (!Array.isArray(o.exits) || !Array.isArray(o.entries)) return null;
  return { exits: o.exits, entries: o.entries };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const REASON: Record<string, string> = {
  target: "target",
  locked_profit: "locked profit",
  stop_loss: "stop-loss",
  trailing_stop: "trailing stop",
  exit_rule: "exit rule",
  square_off: "square-off",
  time_stop: "holding limit",
  end_of_data: "end of the period",
};

/** "Bought 25 at ₹97 (entry 2) · Sold 25 at ₹105 (Target 1) · …", in time order. */
export function describeLegs(legs: TradeLegs, date: (sec: number) => string): string {
  const parts = [
    ...legs.entries.map((e) => ({ time: e.time, text: `Bought ${e.quantity} at ${inr(e.price)} (entry ${e.level})` })),
    ...legs.exits.map((x) => ({ time: x.time, text: `Sold ${x.quantity} at ${inr(x.price)} (${x.targetLevel ? `Target ${x.targetLevel}` : REASON[x.reason] ?? x.reason})` })),
  ].sort((a, b) => a.time - b.time);
  return parts.map((p) => `${date(p.time)}: ${p.text}`).join(" · ");
}
