import { computeQuantity, type PositionSizing } from "@/lib/trading-engine/step";

/**
 * Can this capital actually buy what the strategy wants? The engine never spends more than
 * its capital, so a strategy that can't afford its first position simply never enters —
 * which looks like "nothing happens". Returns a plain-English problem, or null when it's fine.
 */
export function capitalProblem(sizing: PositionSizing, capital: number, price: number, label: string): string | null {
  const wanted = sizing.mode === "FIXED_QUANTITY" ? Math.max(1, Math.floor(sizing.value ?? 1)) : 1;
  if (computeQuantity(capital, price, sizing) >= wanted) return null;
  const rupees = (n: number) => `₹${Math.ceil(n).toLocaleString("en-IN")}`;
  const px = `₹${price.toFixed(2)}`;
  if (sizing.mode === "FIXED_CAPITAL") {
    return `Your strategy puts ${rupees(sizing.value ?? 0)} into each trade, which is less than one ${label} share (about ${px}). Raise the per-trade amount in the strategy's position size.`;
  }
  const need = sizing.mode === "FIXED_QUANTITY" ? wanted * price : sizing.mode === "PERCENT_OF_CAPITAL" ? (price * 100) / Math.max(sizing.value ?? 100, 0.0001) : price;
  const what = sizing.mode === "FIXED_QUANTITY" ? `${wanted} share${wanted === 1 ? "" : "s"}` : sizing.mode === "PERCENT_OF_CAPITAL" ? `${sizing.value}% of the capital per trade` : "a share";
  return `${rupees(capital)} isn't enough: ${label} costs about ${px} a share, and this strategy needs ${what}. Set the capital to at least ${rupees(need)}, or it would never enter a trade.`;
}
