// Spreading a large entry across the session the way a VWAP execution algo does: trade more when the market trades more.
// Only entries are ever sliced; an exit always goes out at once. Pure, so the schedule can be tested without a broker.

/** A typical NSE cash-session volume profile (a U shape: busy at the open and into the close). Weights sum to 1. */
const CURVE: { from: number; to: number; weight: number }[] = [
  { from: 9 * 60 + 15, to: 9 * 60 + 45, weight: 0.16 },
  { from: 9 * 60 + 45, to: 10 * 60 + 15, weight: 0.1 },
  { from: 10 * 60 + 15, to: 10 * 60 + 45, weight: 0.07 },
  { from: 10 * 60 + 45, to: 11 * 60 + 15, weight: 0.06 },
  { from: 11 * 60 + 15, to: 11 * 60 + 45, weight: 0.05 },
  { from: 11 * 60 + 45, to: 12 * 60 + 15, weight: 0.05 },
  { from: 12 * 60 + 15, to: 12 * 60 + 45, weight: 0.05 },
  { from: 12 * 60 + 45, to: 13 * 60 + 15, weight: 0.05 },
  { from: 13 * 60 + 15, to: 13 * 60 + 45, weight: 0.06 },
  { from: 13 * 60 + 45, to: 14 * 60 + 15, weight: 0.07 },
  { from: 14 * 60 + 15, to: 14 * 60 + 45, weight: 0.09 },
  { from: 14 * 60 + 45, to: 15 * 60 + 15, weight: 0.12 },
  { from: 15 * 60 + 15, to: 15 * 60 + 30, weight: 0.07 },
];

/** Entries are slowed down no further than this (IST minute): the last slices must leave time to fill before intraday square-off. */
export const SLICE_END_MINUTE = 15 * 60;
/** Never place two slices closer together than this (minutes). */
export const MIN_GAP_MINUTES = 2;
/** Fewer minutes than this left in the window: don't slice, send it all. */
export const MIN_WINDOW_MINUTES = 12;
export const MAX_SLICES = 8;

export type Slice = { quantity: number; atMinute: number };

/** Share of the whole day's volume traded between two IST minutes (a straight line inside each half-hour). */
function volumeBetween(from: number, to: number): number {
  let sum = 0;
  for (const b of CURVE) {
    const lo = Math.max(from, b.from);
    const hi = Math.min(to, b.to);
    if (hi > lo) sum += b.weight * ((hi - lo) / (b.to - b.from));
  }
  return sum;
}

/** The IST minute by which `share` of the volume between `from` and `to` has traded. */
function minuteAtShare(from: number, to: number, share: number): number {
  const total = volumeBetween(from, to);
  if (total <= 0) return from;
  let lo = from;
  let hi = to;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (volumeBetween(from, mid) / total < share) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The slices of an entry of `total` shares: the first goes now, the rest at the moments by which an equal share of the remaining
 * session's volume has traded (so more slices cluster where the market is busiest). Null when it should not be sliced: fewer than
 * 2 slices wanted, too few shares for each slice to be at least one share, or too little session left.
 */
export function slicePlan(total: number, slices: number, nowMinute: number, endMinute = SLICE_END_MINUTE): Slice[] | null {
  const n = Math.min(MAX_SLICES, Math.floor(slices));
  if (!(n >= 2) || !(total >= n) || !Number.isFinite(nowMinute)) return null;
  const start = Math.max(nowMinute, CURVE[0].from);
  if (endMinute - start < MIN_WINDOW_MINUTES) return null;
  const base = Math.floor(total / n);
  const extra = total - base * n; // the first `extra` slices carry one more share
  const out: Slice[] = [];
  let prev = -Infinity;
  for (let j = 0; j < n; j++) {
    let at = j === 0 ? start : minuteAtShare(start, endMinute, j / n);
    at = Math.max(at, prev + MIN_GAP_MINUTES);
    out.push({ quantity: base + (j < extra ? 1 : 0), atMinute: Math.round(at) });
    prev = at;
  }
  // A schedule pushed past the end by the minimum gap would not fit: send it whole instead.
  return out[out.length - 1].atMinute > endMinute ? null : out;
}
