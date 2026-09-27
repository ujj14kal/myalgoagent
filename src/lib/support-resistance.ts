import type { Candle } from "@/lib/market-data";
import type { IndicatorPoint } from "@/lib/indicators";

// Support & resistance levels, found the way a trader reads them off a chart:
//
// - Support: a price level the market has bounced up from — swing lows that
//   cluster at roughly the same price. Price tends not to fall much below it.
// - Resistance: a level the market has struggled to rise above — swing highs
//   that cluster at roughly the same price.
//
// No look-ahead: a swing low/high is only *known* once `strength` bars have
// closed after it without going lower/higher, so a level only exists from
// that confirming bar onward. Every value at bar t uses bars up to t only.

export const SR_DEFAULTS = { strength: 5, minTouches: 2, zonePercent: 1 } as const;

/** How far back (in bars) swing points still count towards a level. */
const LOOKBACK_BARS = 150;

type Pivot = { price: number; confirmedAt: number; index: number };

function findPivots(candles: Candle[], strength: number, kind: "low" | "high"): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = strength; i + strength < candles.length; i++) {
    const v = kind === "low" ? candles[i].low : candles[i].high;
    let isPivot = true;
    for (let j = i - strength; j <= i + strength && isPivot; j++) {
      if (j === i) continue;
      const other = kind === "low" ? candles[j].low : candles[j].high;
      // Strict on the left, non-strict on the right: a flat double bottom counts once.
      if (kind === "low" ? (j < i ? other <= v : other < v) : j < i ? other >= v : other > v) isPivot = false;
    }
    if (isPivot) pivots.push({ price: v, confirmedAt: i + strength, index: i });
  }
  return pivots;
}

/** Groups prices that sit within `zonePercent` of each other; returns each group's average and size. */
function clusterLevels(prices: number[], zonePercent: number): { level: number; touches: number }[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const out: { level: number; touches: number }[] = [];
  let group: number[] = [];
  const flush = () => {
    if (group.length) out.push({ level: group.reduce((s, p) => s + p, 0) / group.length, touches: group.length });
    group = [];
  };
  for (const p of sorted) {
    if (group.length && p > group[0] * (1 + zonePercent / 100)) flush();
    group.push(p);
  }
  flush();
  return out;
}

/**
 * For every bar: the nearest support level at or below the close, and the
 * nearest resistance level at or above it. A bar with no qualifying level
 * gets no point (the condition can't be evaluated there — treated as false).
 */
export function supportResistance(
  candles: Candle[],
  strength: number = SR_DEFAULTS.strength,
  minTouches: number = SR_DEFAULTS.minTouches,
  zonePercent: number = SR_DEFAULTS.zonePercent,
): { support: IndicatorPoint[]; resistance: IndicatorPoint[] } {
  const k = Math.max(1, Math.floor(strength));
  const touches = Math.max(1, Math.floor(minTouches));
  const zone = Math.max(0.05, zonePercent);
  const lows = findPivots(candles, k, "low");
  const highs = findPivots(candles, k, "high");

  const support: IndicatorPoint[] = [];
  const resistance: IndicatorPoint[] = [];
  for (let t = 0; t < candles.length; t++) {
    const close = candles[t].close;
    const known = (p: Pivot) => p.confirmedAt <= t && p.index >= t - LOOKBACK_BARS;

    const sLevels = clusterLevels(lows.filter(known).map((p) => p.price), zone).filter((l) => l.touches >= touches);
    // Price just below a level (inside its zone) is still "at" that support.
    const below = sLevels.filter((l) => l.level <= close * (1 + zone / 100));
    if (below.length) support.push({ time: candles[t].time, value: Math.max(...below.map((l) => l.level)) });

    const rLevels = clusterLevels(highs.filter(known).map((p) => p.price), zone).filter((l) => l.touches >= touches);
    const above = rLevels.filter((l) => l.level >= close * (1 - zone / 100));
    if (above.length) resistance.push({ time: candles[t].time, value: Math.min(...above.map((l) => l.level)) });
  }
  return { support, resistance };
}

/**
 * Per bar: is this candle *at* a support (its low reached into the support
 * zone and it didn't close below it) or at a resistance (its high reached into
 * the zone and it didn't close above it)? Used by "candle pattern at support /
 * resistance" entries.
 */
export function atLevelSeries(candles: Candle[], level: "SUPPORT" | "RESISTANCE", zonePercent: number = SR_DEFAULTS.zonePercent): boolean[] {
  const { support, resistance } = supportResistance(candles, SR_DEFAULTS.strength, SR_DEFAULTS.minTouches, zonePercent);
  const byTime = new Map((level === "SUPPORT" ? support : resistance).map((p) => [p.time, p.value]));
  const z = zonePercent / 100;
  return candles.map((c) => {
    const lv = byTime.get(c.time);
    if (lv === undefined) return false;
    return level === "SUPPORT" ? c.low <= lv * (1 + z) && c.close >= lv * (1 - z) : c.high >= lv * (1 - z) && c.close <= lv * (1 + z);
  });
}
