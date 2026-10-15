// The rules of a price alert, kept pure so they are tested on their own.

export type AlertDirection = "ABOVE" | "BELOW";
export const MAX_ACTIVE_ALERTS = 25;

/** Has the price reached the alert's level? */
export function isTriggered(direction: AlertDirection, level: number, price: number): boolean {
  return Number.isFinite(price) && (direction === "ABOVE" ? price >= level : price <= level);
}

/** A plain-English sentence for the alert: "RELIANCE goes above ₹3,000". */
export function describeAlert(a: { symbol: string; direction: AlertDirection; price: number }): string {
  return `${a.symbol.replace(/\.NS$/, "")} ${a.direction === "ABOVE" ? "goes to or above" : "falls to or below"} ₹${a.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Why a new alert can't be created, or null: the price must be on the far side of where it is now. */
export function checkNewAlert(direction: AlertDirection, level: number, current: number | null): string | null {
  if (!(level > 0) || !Number.isFinite(level)) return "Enter a price above 0.";
  if (current !== null && isTriggered(direction, level, current))
    return `${current.toLocaleString("en-IN", { maximumFractionDigits: 2 })} is already ${direction === "ABOVE" ? "at or above" : "at or below"} that level, so it would fire at once. Pick a ${direction === "ABOVE" ? "higher" : "lower"} price.`;
  return null;
}
