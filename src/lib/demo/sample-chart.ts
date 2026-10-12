import type { Candle } from "@/lib/market-data";

// A made-up stock for demos: prices start at ₹1,000 and wander with a seeded generator, so the same seed always draws
// the same chart. Demos search a few seeds for one where the thing being shown actually happens a few times. Nothing
// here is real market data, and the screens that use it say so.

export const DEMO_BASE = 1000;
export const DEMO_BARS = 140;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Daily-looking candles for a dummy stock. Trends come and go (a slowly changing drift) with a few volume surges, so patterns have something to find. */
export function sampleCandles(seed: number, bars = DEMO_BARS, base = DEMO_BASE): Candle[] {
  const r = rng(seed * 7919 + 13);
  const t0 = Date.UTC(2026, 0, 5, 3, 45) / 1000; // 09:15 IST on a Monday
  const out: Candle[] = [];
  let price = base;
  let drift = 0;
  let day = 0;
  while (out.length < bars) {
    const weekday = new Date((t0 + day * 86_400) * 1000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      // The drift is pulled back toward zero and nudged, so there are runs up, runs down and pauses.
      drift = drift * 0.93 + (r() - 0.5) * 0.0042;
      const open = price;
      const move = drift + (r() - 0.5) * 0.017;
      const close = Math.max(base * 0.35, open * (1 + move));
      const wick = open * (0.002 + r() * 0.008);
      const surge = r() < 0.07 ? 2.2 + r() * 1.5 : 1;
      out.push({
        time: t0 + day * 86_400,
        open: round(open),
        high: round(Math.max(open, close) + wick),
        low: round(Math.min(open, close) - wick),
        close: round(close),
        volume: Math.round((900_000 + r() * 400_000) * surge * (1 + Math.abs(move) * 30)),
      });
      price = close;
    }
    day++;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The first of `seeds` whose chart scores best by `score` (higher is better, a perfect score ends the search). */
export function bestSeed(score: (candles: Candle[]) => number, perfect: number, tries = 60): { seed: number; candles: Candle[]; score: number } {
  let best = { seed: 1, candles: sampleCandles(1), score: -Infinity };
  for (let seed = 1; seed <= tries; seed++) {
    const candles = sampleCandles(seed);
    let s = -Infinity;
    try {
      s = score(candles);
    } catch {
      continue;
    }
    if (s > best.score) best = { seed, candles, score: s };
    if (s >= perfect) break;
  }
  return best;
}

/** Indices where a series turns from false to true — the moments a rule "fires". */
export function risingEdges(truth: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < truth.length; i++) if (truth[i] && !truth[i - 1]) out.push(i);
  return out;
}
