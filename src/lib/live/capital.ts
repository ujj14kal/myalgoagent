import { computeQuantity, type PositionSizing } from "@/lib/trading-engine/step";

/**
 * Can this capital actually buy what the strategy wants? The engine never spends more than
 * its capital, so a strategy that can't afford its first position simply never enters —
 * which looks like "nothing happens". Returns a plain-English problem, or null when it's fine.
 */
/** Intraday (MIS) trades need only a fraction of a share's price as margin; brokers allow roughly this multiple, varying by stock. */
export const INTRADAY_BUYING_POWER = 5;

export function capitalProblem(sizing: PositionSizing, capital: number, price: number, label: string, leverage = 1, riskPerShare?: number): string | null {
  const wanted = sizing.mode === "FIXED_QUANTITY" ? Math.max(1, Math.floor(sizing.value ?? 1)) : 1;
  if (sizing.mode === "RISK_PERCENT") {
    // Without a known stop distance (an ATR stop) the engine sizes the order at entry.
    if (!riskPerShare) return null;
    const riskRupees = (capital * (sizing.value ?? 0)) / 100;
    if (computeQuantity(capital * leverage, price, { ...sizing, riskCapital: capital }, riskPerShare) >= 1) return null;
    return `Risking ${sizing.value}% of ₹${Math.ceil(capital).toLocaleString("en-IN")} is ₹${Math.round(riskRupees).toLocaleString("en-IN")}, which is less than the ₹${riskPerShare.toFixed(2)} a single ${label} share would lose at your stop-loss, so it would never enter a trade. Raise the capital or the risk percentage, or tighten the stop-loss.`;
  }
  if (computeQuantity(capital * leverage, price, sizing) >= wanted) return null;
  const rupees = (n: number) => `₹${Math.ceil(n).toLocaleString("en-IN")}`;
  const px = `₹${price.toFixed(2)}`;
  if (sizing.mode === "FIXED_CAPITAL") {
    return `Your strategy puts ${rupees(sizing.value ?? 0)} into each trade, which is less than one ${label} share (about ${px}). Raise the per-trade amount in the strategy's position size.`;
  }
  const need = (sizing.mode === "FIXED_QUANTITY" ? wanted * price : sizing.mode === "PERCENT_OF_CAPITAL" ? (price * 100) / Math.max(sizing.value ?? 100, 0.0001) : price) / leverage;
  const what = sizing.mode === "FIXED_QUANTITY" ? `${wanted} share${wanted === 1 ? "" : "s"}` : sizing.mode === "PERCENT_OF_CAPITAL" ? `${sizing.value}% of the capital per trade` : "a share";
  return `${rupees(capital)} isn't enough: ${label} costs about ${px} a share, and this strategy needs ${what}. Set the capital to at least ${rupees(need)}${leverage > 1 ? ` (intraday buying power of up to ${leverage}×)` : ""}, or it would never enter a trade.`;
}

/**
 * A strategy sizes its own order; the user's per-order value limit still applies. Rather than let an
 * over-limit order be refused (which would pause the whole strategy), shrink it to fit.
 */
export function fitToOrderLimit(quantity: number, price: number, maxValue: number): { quantity: number; reduced: boolean } {
  if (!(price > 0) || quantity * price <= maxValue) return { quantity, reduced: false };
  return { quantity: Math.max(0, Math.floor(maxValue / price)), reduced: true };
}

/**
 * Does the kill switch stop this order? It stops anything that opens a position — a buy, or a
 * strategy's entry in either direction (a short strategy opens with a SELL). Exits are never stopped.
 */
export function killSwitchBlocks(side: "BUY" | "SELL", purpose: "entry" | "exit" | "manual" | "strategy"): boolean {
  if (purpose === "exit") return false;
  return side === "BUY" || purpose === "entry" || purpose === "strategy";
}
