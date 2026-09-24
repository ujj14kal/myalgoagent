export type Tone = "up" | "down" | "flat";

/** Direction of a figure — zero is its own neutral state, never shown green. */
export function toneOf(n: number, epsilon = 0.005): Tone {
  if (n > epsilon) return "up";
  if (n < -epsilon) return "down";
  return "flat";
}

export const TONE_TEXT: Record<Tone, string> = {
  up: "text-brand-buy",
  down: "text-brand-sell",
  flat: "text-brand-navy/50",
};

const MINUS = "−";

/** ₹ with Indian digit grouping (₹4,00,000). */
export function formatINR(n: number, decimals = 0): string {
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? MINUS : ""}₹${abs}`;
}

/** Signed ₹ change: +₹1,250 / −₹1,220 / ₹0. */
export function formatSignedINR(n: number, decimals = 0): string {
  const t = toneOf(n);
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return t === "flat" ? `₹${(0).toFixed(decimals)}` : `${t === "up" ? "+" : MINUS}₹${abs}`;
}

/** Signed percent: +1.25% / −0.73% / 0.00%. */
export function formatPct(n: number, decimals = 2): string {
  const t = toneOf(n);
  if (t === "flat") return `${(0).toFixed(decimals)}%`;
  return `${t === "up" ? "+" : MINUS}${Math.abs(n).toFixed(decimals)}%`;
}

/** Plain price with Indian grouping and fixed decimals: 2,997.10 */
export function formatPrice(n: number, decimals = 2): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
