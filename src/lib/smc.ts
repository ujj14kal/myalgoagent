import type { Candle } from "@/lib/market-data";

// Smart-money (market-structure) components, each a true/false per candle — the building blocks a user turns into
// their own "My BOS", "My FVG" etc. Every detector is causal: a swing high or low only exists once `swing` candles
// after it have closed (that's when you could first have seen it), so nothing here ever looks ahead.
//
//  BOS               — break of structure: a close beyond the last confirmed swing high (bullish) / low (bearish).
//  CHOCH             — change of character: the first BOS against the previous one (the trend turning).
//  LIQUIDITY_SWEEP   — a wick through the last swing low (bullish) / high (bearish) that closes back inside:
//                      the stops below it taken out, price rejected.
//  FVG               — fair value gap formed: a three-candle gap (bullish: this low above the high two candles ago).
//  FVG_RETEST        — price trades back into an earlier, still-open gap of that side (within `maxAge` candles).
//  ORDER_BLOCK_RETEST — price trades back into the last opposite candle before a BOS (the order block) within `maxAge`.
//
// Each event fires once per swing / gap / order block, on the candle it happens.

export type SmcKind = "BOS" | "CHOCH" | "LIQUIDITY_SWEEP" | "FVG" | "FVG_RETEST" | "ORDER_BLOCK_RETEST";
export type SmcSide = "BULLISH" | "BEARISH";
export const SMC_KINDS: SmcKind[] = ["BOS", "CHOCH", "LIQUIDITY_SWEEP", "FVG", "FVG_RETEST", "ORDER_BLOCK_RETEST"];

export interface SmcParams {
  /** Candles each side of a swing high/low (also how long it takes to be confirmed). Default 3. */
  swing?: number;
  /** Retests only: how many candles after it formed a gap / order block still counts. Default 30. */
  maxAge?: number;
  /** FVG only: the smallest gap that counts, as % of price. Default 0 (any gap). */
  minGapPct?: number;
}

export const SMC_DEFAULTS = { swing: 3, maxAge: 30, minGapPct: 0 } as const;

export const SMC_LABEL: Record<SmcKind, string> = {
  BOS: "Break of structure (BOS)",
  CHOCH: "Change of character (CHoCH)",
  LIQUIDITY_SWEEP: "Liquidity sweep",
  FVG: "Fair value gap (FVG) forms",
  FVG_RETEST: "Fair value gap retest",
  ORDER_BLOCK_RETEST: "Order block retest",
};

export const SMC_HELP: Record<SmcKind, string> = {
  BOS: "A candle closes beyond the last confirmed swing high (bullish) or swing low (bearish).",
  CHOCH: "The first break of structure in the opposite direction to the previous one — the trend changing character.",
  LIQUIDITY_SWEEP: "A wick takes out the last swing low (bullish) / high (bearish) but the candle closes back inside — stops run, price rejected.",
  FVG: "Three candles leave a gap: the third candle's low is above the first candle's high (bullish), or its high below the first's low (bearish).",
  FVG_RETEST: "Price comes back into an earlier gap of that side that hasn't been filled, within the age limit.",
  ORDER_BLOCK_RETEST: "Price comes back into the order block — the last opposite candle before a break of structure — within the age limit.",
};

type Swing = { index: number; price: number };

/** Confirmed swings, each with the candle from which it is known (index + swing). */
function swings(candles: Candle[], n: number): { highs: (Swing & { known: number })[]; lows: (Swing & { known: number })[] } {
  const highs: (Swing & { known: number })[] = [];
  const lows: (Swing & { known: number })[] = [];
  for (let i = n; i < candles.length - n; i++) {
    let hi = true;
    let lo = true;
    for (let k = i - n; k <= i + n && (hi || lo); k++) {
      if (k === i) continue;
      if (candles[k].high >= candles[i].high) hi = false;
      if (candles[k].low <= candles[i].low) lo = false;
    }
    if (hi) highs.push({ index: i, price: candles[i].high, known: i + n });
    if (lo) lows.push({ index: i, price: candles[i].low, known: i + n });
  }
  return { highs, lows };
}

/** The structure breaks in order: each confirmed swing can be broken once. */
function structureBreaks(candles: Candle[], n: number): { index: number; side: SmcSide; swingIndex: number }[] {
  const { highs, lows } = swings(candles, n);
  const out: { index: number; side: SmcSide; swingIndex: number }[] = [];
  let hi: (Swing & { known: number }) | null = null;
  let lo: (Swing & { known: number }) | null = null;
  let hiBroken = true;
  let loBroken = true;
  let h = 0;
  let l = 0;
  for (let i = 0; i < candles.length; i++) {
    // The latest swing known by this candle replaces the older one (a fresh, unbroken level).
    while (h < highs.length && highs[h].known <= i) (hi = highs[h++]), (hiBroken = false);
    while (l < lows.length && lows[l].known <= i) (lo = lows[l++]), (loBroken = false);
    if (hi && !hiBroken && candles[i].close > hi.price) {
      out.push({ index: i, side: "BULLISH", swingIndex: hi.index });
      hiBroken = true;
    }
    if (lo && !loBroken && candles[i].close < lo.price) {
      out.push({ index: i, side: "BEARISH", swingIndex: lo.index });
      loBroken = true;
    }
  }
  return out;
}

/** One smart-money component as a true/false series. */
export function computeSmcSeries(candles: Candle[], kind: SmcKind, side: SmcSide, params: SmcParams = {}): boolean[] {
  const n = Math.max(1, Math.min(20, Math.floor(params.swing ?? SMC_DEFAULTS.swing)));
  const maxAge = Math.max(1, Math.min(500, Math.floor(params.maxAge ?? SMC_DEFAULTS.maxAge)));
  const minGap = Math.max(0, params.minGapPct ?? SMC_DEFAULTS.minGapPct);
  const out = candles.map(() => false);
  const bull = side === "BULLISH";

  switch (kind) {
    case "BOS":
    case "CHOCH": {
      let prev: SmcSide | null = null;
      for (const b of structureBreaks(candles, n)) {
        if (b.side === side && (kind === "BOS" || (prev !== null && prev !== side))) out[b.index] = true;
        prev = b.side;
      }
      return out;
    }
    case "LIQUIDITY_SWEEP": {
      const { highs, lows } = swings(candles, n);
      const levels = bull ? lows : highs;
      let j = 0;
      let level: (Swing & { known: number }) | null = null;
      let swept = true;
      for (let i = 0; i < candles.length; i++) {
        while (j < levels.length && levels[j].known <= i) (level = levels[j++]), (swept = false);
        if (!level || swept) continue;
        const c = candles[i];
        if (bull ? c.low < level.price && c.close > level.price : c.high > level.price && c.close < level.price) {
          out[i] = true;
          swept = true;
        } else if (bull ? c.close < level.price : c.close > level.price) {
          swept = true; // closed through it: a break, not a sweep
        }
      }
      return out;
    }
    case "FVG":
    case "FVG_RETEST": {
      const open: { top: number; bottom: number; formed: number }[] = [];
      for (let i = 2; i < candles.length; i++) {
        const a = candles[i - 2];
        const c = candles[i];
        // Retests first (a gap can't be retested on the candle that forms it).
        if (kind === "FVG_RETEST") {
          for (let g = open.length - 1; g >= 0; g--) {
            const gap = open[g];
            if (i - gap.formed > maxAge) {
              open.splice(g, 1);
              continue;
            }
            const enters = bull ? c.low <= gap.top : c.high >= gap.bottom;
            const fails = bull ? c.close < gap.bottom : c.close > gap.top;
            if (fails) open.splice(g, 1);
            else if (enters) {
              out[i] = true;
              open.splice(g, 1);
            }
          }
        }
        const gapSize = bull ? c.low - a.high : a.low - c.high;
        if (gapSize > 0 && (gapSize / candles[i - 1].close) * 100 >= minGap) {
          if (kind === "FVG") out[i] = true;
          else open.push(bull ? { bottom: a.high, top: c.low, formed: i } : { bottom: c.high, top: a.low, formed: i });
        }
      }
      return out;
    }
    case "ORDER_BLOCK_RETEST": {
      const blocks: { high: number; low: number; formed: number }[] = [];
      const breaks = structureBreaks(candles, n).filter((b) => b.side === side);
      let k = 0;
      for (let i = 0; i < candles.length; i++) {
        for (let g = blocks.length - 1; g >= 0; g--) {
          const ob = blocks[g];
          if (i - ob.formed > maxAge) {
            blocks.splice(g, 1);
            continue;
          }
          const c = candles[i];
          const enters = bull ? c.low <= ob.high : c.high >= ob.low;
          const fails = bull ? c.close < ob.low : c.close > ob.high;
          if (fails) blocks.splice(g, 1);
          else if (enters) {
            out[i] = true;
            blocks.splice(g, 1);
          }
        }
        // A break on this candle defines its order block: the last opposite-coloured candle before the move.
        while (k < breaks.length && breaks[k].index === i) {
          for (let j = i - 1; j >= Math.max(0, breaks[k].swingIndex - n); j--) {
            const c = candles[j];
            if (bull ? c.close < c.open : c.close > c.open) {
              blocks.push({ high: c.high, low: c.low, formed: i });
              break;
            }
          }
          k++;
        }
        while (k < breaks.length && breaks[k].index < i) k++;
      }
      return out;
    }
  }
}
