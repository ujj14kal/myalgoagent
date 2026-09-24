import type { NewPaperOrder } from "./sync";
import type { RiskUnit } from "@/lib/trading-engine/step";

// Plain-English explanation of a paper fill, built only from engine facts:
// which rule fired, on which bar, at what price, and the realised P&L. This is
// the agent explaining its own work — no model involved, nothing guessed.

type Leg = { unit: RiskUnit; value: number } | null;

export type ExplainContext = {
  symbol: string;
  strategyName: string;
  direction: "LONG" | "SHORT";
  entryRule: string;
  exitRule: string;
  stopLoss: Leg;
  target: Leg;
  trailingStop: Leg;
};

const inr = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const signedInr = (n: number) => `${n < 0 ? "−" : "+"}${inr(n)}`;
const day = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function legText(leg: Leg): string {
  if (!leg) return "";
  if (leg.unit === "PERCENT") return `${leg.value}%`;
  if (leg.unit === "POINTS") return `₹${leg.value}`;
  return `${leg.value}× ATR`;
}

export function explainPaperOrder(o: NewPaperOrder, c: ExplainContext): string {
  const isOpen = o.reason === "entry_rule" || o.reason === "pyramid";
  const qty = Number.isInteger(o.quantity) ? o.quantity : Number(o.quantity.toFixed(4));
  const verb = isOpen ? (c.direction === "SHORT" ? "Sold short" : "Bought") : c.direction === "SHORT" ? "Bought back" : "Sold";
  const head = `${verb} ${qty} ${c.symbol} at ${inr(o.price)} (${c.strategyName})`;
  const pnl = o.netPnl != null ? ` P&L ${signedInr(o.netPnl)} after fees.` : "";

  switch (o.reason) {
    case "entry_rule":
      return `${head} — your entry rule (${clip(c.entryRule)}) was true at the close on ${day(o.signalTime)}, so it filled at the next open.`;
    case "pyramid":
      return `${head} — your entry rule fired again on ${day(o.signalTime)} while the position was open, so it added to it.`;
    case "exit_rule":
      return `${head} — your exit rule (${clip(c.exitRule)}) became true at the close on ${day(o.signalTime)}, so it closed at the next open.${pnl}`;
    case "stop_loss":
      return `${head} — your ${legText(c.stopLoss)} stop-loss was hit on ${day(o.signalTime)}.${pnl}`;
    case "target":
      return `${head} — your ${legText(c.target)} take-profit was reached on ${day(o.signalTime)}.${pnl}`;
    case "trailing_stop":
      return `${head} — your ${legText(c.trailingStop)} trailing stop was hit on ${day(o.signalTime)} (price moved that far back from its best level).${pnl}`;
  }
}
