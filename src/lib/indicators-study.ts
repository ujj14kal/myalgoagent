import type { Candle } from "@/lib/market-data";
import { atr, bollingerBands, keltnerChannels, type IndicatorPoint } from "@/lib/indicators";

// Indicators built from the analyst studies (Logics folder): Bollinger %B, bandwidth and squeeze, session VWAP with
// standard-deviation bands, "change over N bars" helpers for RSI/MACD/band slopes, and Fibonacci levels from confirmed swings.
// Every value uses only candles up to and including its own bar, so a backtest never sees the future.

const byTime = (p: IndicatorPoint[]) => new Map(p.map((x) => [x.time, x.value]));

// ---------- Bollinger: %B, BandWidth, squeeze ----------

/** %B: where the close sits inside the bands (0 = lower band, 1 = upper band, above 1 / below 0 = outside). Flat price (no band width) gives no value. */
export function bollingerPercentB(candles: Candle[], period = 20, k = 2): IndicatorPoint[] {
  const b = bollingerBands(candles, period, k);
  const lo = byTime(b.lower);
  const out: IndicatorPoint[] = [];
  const close = byTime(candles.map((c) => ({ time: c.time, value: c.close })));
  for (const u of b.upper) {
    const l = lo.get(u.time);
    const c = close.get(u.time);
    if (l === undefined || c === undefined || u.value === l) continue;
    out.push({ time: u.time, value: (c - l) / (u.value - l) });
  }
  return out;
}

/** BandWidth in percent: (upper - lower) / middle * 100. Low = quiet market (squeeze), high = expansion. */
export function bollingerBandwidth(candles: Candle[], period = 20, k = 2): IndicatorPoint[] {
  const b = bollingerBands(candles, period, k);
  const lo = byTime(b.lower);
  const mid = byTime(b.middle);
  const out: IndicatorPoint[] = [];
  for (const u of b.upper) {
    const l = lo.get(u.time);
    const m = mid.get(u.time);
    if (l === undefined || m === undefined || m === 0) continue;
    out.push({ time: u.time, value: ((u.value - l) / m) * 100 });
  }
  return out;
}

/**
 * Squeeze flag: 1 when today's BandWidth is among the narrowest `percentile`% of the last `lookback` bars (the share of those bars that are strictly narrower is at most `percentile`%), else 0.
 * Needs a full lookback of bandwidth values first (no value before that, not zero).
 */
export function bollingerSqueeze(candles: Candle[], period = 20, k = 2, lookback = 120, percentile = 15): IndicatorPoint[] {
  const bw = bollingerBandwidth(candles, period, k);
  const out: IndicatorPoint[] = [];
  for (let i = lookback - 1; i < bw.length; i++) {
    // Share of the lookback that is strictly narrower than today (ties do not count against it).
    let narrower = 0;
    for (let j = i - lookback + 1; j <= i; j++) if (bw[j].value < bw[i].value) narrower++;
    out.push({ time: bw[i].time, value: (narrower / lookback) * 100 <= percentile ? 1 : 0 });
  }
  return out;
}

/** TTM-style squeeze: 1 while the Bollinger Bands sit completely inside the Keltner Channels, else 0. */
export function keltnerSqueeze(candles: Candle[], period = 20, k = 2, keltnerMultiplier = 1.5): IndicatorPoint[] {
  const b = bollingerBands(candles, period, k);
  const kc = keltnerChannels(candles, period, keltnerMultiplier);
  const kcU = byTime(kc.upper);
  const kcL = byTime(kc.lower);
  const bbL = byTime(b.lower);
  const out: IndicatorPoint[] = [];
  for (const u of b.upper) {
    const ku = kcU.get(u.time);
    const kl = kcL.get(u.time);
    const bl = bbL.get(u.time);
    if (ku === undefined || kl === undefined || bl === undefined) continue;
    out.push({ time: u.time, value: u.value < ku && bl > kl ? 1 : 0 });
  }
  return out;
}

// ---------- Session VWAP with bands ----------

/** The trading day a candle belongs to: the India (IST, UTC+5:30) calendar date, which for NSE/BSE is the exchange session. */
export const sessionDay = (time: number) => Math.floor((time + 19_800) / 86_400);

export type VwapBands = { vwap: IndicatorPoint[]; upper1: IndicatorPoint[]; lower1: IndicatorPoint[]; upper2: IndicatorPoint[]; lower2: IndicatorPoint[] };

/**
 * VWAP that restarts every trading session, with volume-weighted standard-deviation bands at 1 and 2 deviations.
 * typical price = (high + low + close) / 3. On daily or longer candles every candle is its own session, so VWAP is simply that
 * candle's typical price (use an anchored VWAP for longer horizons). A candle with no volume so far in the session has no value.
 */
export function sessionVwap(candles: Candle[]): VwapBands {
  const out: VwapBands = { vwap: [], upper1: [], lower1: [], upper2: [], lower2: [] };
  let day = Number.NaN;
  let pv = 0;
  let pv2 = 0;
  let vol = 0;
  for (const c of candles) {
    const d = sessionDay(c.time);
    if (d !== day) {
      day = d;
      pv = 0;
      pv2 = 0;
      vol = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    pv2 += tp * tp * c.volume;
    vol += c.volume;
    if (vol <= 0) continue;
    const v = pv / vol;
    // Volume-weighted variance of the typical price around VWAP: E[tp²] - VWAP².
    const sd = Math.sqrt(Math.max(0, pv2 / vol - v * v));
    out.vwap.push({ time: c.time, value: v });
    out.upper1.push({ time: c.time, value: v + sd });
    out.lower1.push({ time: c.time, value: v - sd });
    out.upper2.push({ time: c.time, value: v + 2 * sd });
    out.lower2.push({ time: c.time, value: v - 2 * sd });
  }
  return out;
}

// ---------- Change over N bars ----------

/** value now minus value `bars` bars ago: above zero = rising ("turning up"), below zero = falling. */
export function changeOver(points: IndicatorPoint[], bars = 1): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  for (let i = bars; i < points.length; i++) out.push({ time: points[i].time, value: points[i].value - points[i - bars].value });
  return out;
}

// ---------- Fibonacci levels from confirmed swings ----------

export type FibSeries = {
  ret382: IndicatorPoint[];
  ret500: IndicatorPoint[];
  ret618: IndicatorPoint[];
  ret786: IndicatorPoint[];
  ext1272: IndicatorPoint[];
  ext1618: IndicatorPoint[];
  /** 1 while the candle is in the 50%–61.8% "golden zone" of a valid swing (within 0.3 ATR), else 0. */
  goldenZone: IndicatorPoint[];
  /** +1 after an up-swing (low then high), -1 after a down-swing (high then low); no value when no valid swing. */
  direction: IndicatorPoint[];
};

/**
 * Fibonacci retracement and extension levels from the latest confirmed swing.
 *
 * A pivot (highest high / lowest low of `left` bars before and `right` bars after) is only known `right` bars later, so at each
 * candle only pivots that were already confirmed are used: nothing repaints and a backtest sees what a live strategy would.
 * Pivots alternate high/low; a swing smaller than `minSwingAtr` × ATR(14) is noise and ignored; a new extreme of the same kind
 * extends the current swing. For a swing A -> B (range = B - A, signed): retracement r = B - r × range, extension e = A + e × range.
 * The setup is void (no values) once a candle closes beyond the swing's start A, until a new swing is confirmed.
 */
export function fibonacciLevels(candles: Candle[], left = 5, right = 5, minSwingAtr = 3): FibSeries {
  const out: FibSeries = { ret382: [], ret500: [], ret618: [], ret786: [], ext1272: [], ext1618: [], goldenZone: [], direction: [] };
  const n = candles.length;
  if (n < left + right + 2) return out;
  const atrByTime = byTime(atr(candles, 14));

  // Pivot confirmed at bar `i + right`.
  const pivotAt = new Map<number, { index: number; type: "high" | "low"; price: number }[]>();
  for (let i = left; i < n - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    const confirmedAt = i + right;
    const list = pivotAt.get(confirmedAt) ?? [];
    if (isHigh) list.push({ index: i, type: "high", price: candles[i].high });
    if (isLow) list.push({ index: i, type: "low", price: candles[i].low });
    if (list.length) pivotAt.set(confirmedAt, list);
  }

  let a: { type: "high" | "low"; price: number } | null = null; // swing start
  let b: { type: "high" | "low"; price: number } | null = null; // swing end
  let voided = false;

  for (let t = 0; t < n; t++) {
    const c = candles[t];
    const atrNow = atrByTime.get(c.time);
    for (const p of pivotAt.get(t) ?? []) {
      if (!b) {
        if (!a) a = p;
        else if (p.type === a.type) a = (p.type === "high" ? p.price > a.price : p.price < a.price) ? p : a;
        else if (atrNow !== undefined && Math.abs(p.price - a.price) >= minSwingAtr * atrNow) {
          b = p;
          voided = false;
        }
      } else if (p.type === b.type) {
        // A new, more extreme pivot of the same kind extends the swing.
        if (p.type === "high" ? p.price > b.price : p.price < b.price) {
          b = p;
          voided = false;
        }
      } else if (atrNow !== undefined && Math.abs(p.price - b.price) >= minSwingAtr * atrNow) {
        a = b;
        b = p;
        voided = false;
      }
    }
    if (!a || !b) continue;
    // Invalid once price closes beyond the swing's start.
    if (b.price > a.price ? c.close < a.price : c.close > a.price) voided = true;
    if (voided) continue;

    const range = b.price - a.price;
    const ret = (r: number) => b!.price - r * range;
    out.ret382.push({ time: c.time, value: ret(0.382) });
    out.ret500.push({ time: c.time, value: ret(0.5) });
    out.ret618.push({ time: c.time, value: ret(0.618) });
    out.ret786.push({ time: c.time, value: ret(0.786) });
    out.ext1272.push({ time: c.time, value: a.price + 1.272 * range });
    out.ext1618.push({ time: c.time, value: a.price + 1.618 * range });
    const up = range > 0;
    out.direction.push({ time: c.time, value: up ? 1 : -1 });
    if (atrNow !== undefined) {
      const near = ret(0.5);
      const far = ret(0.618);
      const tol = 0.3 * atrNow;
      const inZone = up ? c.low <= near && c.close >= far - tol : c.high >= near && c.close <= far + tol;
      out.goldenZone.push({ time: c.time, value: inZone ? 1 : 0 });
    }
  }
  return out;
}
