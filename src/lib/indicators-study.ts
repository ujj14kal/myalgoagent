import type { Candle } from "@/lib/market-data";
import { atr, bollingerBands, ema, keltnerChannels, macd, rsi, sma, standardDeviation, wma, type IndicatorPoint } from "@/lib/indicators";

// Indicators built from the analyst studies (Logics folder): Bollinger %B, bandwidth and squeeze, session VWAP with
// standard-deviation bands, "change over N bars" helpers for RSI/MACD/band slopes, and Fibonacci levels from confirmed swings.
// Every value uses only candles up to and including its own bar, so a backtest never sees the future.

const byTime = (p: IndicatorPoint[]) => new Map(p.map((x) => [x.time, x.value]));

// ---------- Bollinger: %B, BandWidth, squeeze ----------

/** Price an indicator reads: 0 close, 1 (high+low)/2, 2 (high+low+close)/3, 3 (open+high+low+close)/4. */
export function priceBySource(c: Candle, source: number): number {
  if (source === 1) return (c.high + c.low) / 2;
  if (source === 2) return (c.high + c.low + c.close) / 3;
  if (source === 3) return (c.open + c.high + c.low + c.close) / 4;
  return c.close;
}

/** The candles with `close` replaced by the chosen source, so any close-based indicator can read it. */
export const withSource = (candles: Candle[], source = 0): Candle[] => (source ? candles.map((c) => ({ ...c, close: priceBySource(c, source) })) : candles);

/** Bollinger Bands on a chosen source and middle-line type (0 SMA, 1 EMA, 2 WMA); the width is always the population standard deviation. */
export function bollingerEx(candles: Candle[], period = 20, k = 2, source = 0, maType = 0) {
  const sc = withSource(candles, source);
  if (maType === 0) return bollingerBands(sc, period, k);
  const mid = maType === 1 ? ema(sc, period) : wma(sc, period);
  const sd = byTime(standardDeviation(sc, period));
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  for (const m of mid) {
    const d = sd.get(m.time);
    if (d === undefined) continue;
    middle.push(m);
    upper.push({ time: m.time, value: m.value + k * d });
    lower.push({ time: m.time, value: m.value - k * d });
  }
  return { upper, middle, lower };
}

/** %B: where the close sits inside the bands (0 = lower band, 1 = upper band, above 1 / below 0 = outside them). A flat price (no band width) gives no value. */
export function bollingerPercentB(candles: Candle[], period = 20, k = 2, source = 0, maType = 0): IndicatorPoint[] {
  const b = bollingerEx(candles, period, k, source, maType);
  const lo = byTime(b.lower);
  const out: IndicatorPoint[] = [];
  const close = byTime(withSource(candles, source).map((c) => ({ time: c.time, value: c.close })));
  for (const u of b.upper) {
    const l = lo.get(u.time);
    const c = close.get(u.time);
    if (l === undefined || c === undefined || u.value === l) continue;
    out.push({ time: u.time, value: (c - l) / (u.value - l) });
  }
  return out;
}

/** BandWidth in percent: (upper - lower) / middle x 100. Low = quiet market (squeeze), high = expansion. */
export function bollingerBandwidth(candles: Candle[], period = 20, k = 2, source = 0, maType = 0): IndicatorPoint[] {
  const b = bollingerEx(candles, period, k, source, maType);
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
  /** 1 when the close is within 0.3 ATR of retracement levels from two or more of the last three swings (a Fibonacci cluster), else 0. */
  confluence: IndicatorPoint[];
  /** Candles since the current swing's end was confirmed: rules can expire a setup after N candles. */
  age: IndicatorPoint[];
  /** The current valid swing's start (A) and end (B) prices. */
  swingStart: IndicatorPoint[];
  swingEnd: IndicatorPoint[];
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
  const out: FibSeries = { ret382: [], ret500: [], ret618: [], ret786: [], ext1272: [], ext1618: [], goldenZone: [], direction: [], confluence: [], age: [], swingStart: [], swingEnd: [] };
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
  let bSetBar = 0; // candle on which the current swing end was confirmed
  const earlier: { a: number; b: number; voided: boolean }[] = []; // the two swings before the current one

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
          bSetBar = t;
        }
      } else if (p.type === b.type) {
        // A new, more extreme pivot of the same kind extends the swing.
        if (p.type === "high" ? p.price > b.price : p.price < b.price) {
          b = p;
          voided = false;
          bSetBar = t;
        }
      } else if (atrNow !== undefined && Math.abs(p.price - b.price) >= minSwingAtr * atrNow) {
        earlier.unshift({ a: a!.price, b: b.price, voided });
        if (earlier.length > 2) earlier.pop();
        a = b;
        b = p;
        voided = false;
        bSetBar = t;
      }
    }
    if (!a || !b) continue;
    // Invalid once price closes beyond the swing's start.
    if (b.price > a.price ? c.close < a.price : c.close > a.price) voided = true;
    for (const e of earlier) if (e.b > e.a ? c.close < e.a : c.close > e.a) e.voided = true;
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
    out.age.push({ time: c.time, value: t - bSetBar });
    out.swingStart.push({ time: c.time, value: a.price });
    out.swingEnd.push({ time: c.time, value: b.price });
    if (atrNow !== undefined) {
      // Cluster: retracement levels of two or more different swings sitting within 0.3 ATR of the close.
      let swingsNear = 0;
      for (const sw of [{ a: a.price, b: b.price }, ...earlier.filter((e) => !e.voided)]) {
        const rg = sw.b - sw.a;
        if ([0.382, 0.5, 0.618, 0.786].some((r) => Math.abs(sw.b - r * rg - c.close) <= 0.3 * atrNow)) swingsNear++;
      }
      out.confluence.push({ time: c.time, value: swingsNear >= 2 ? 1 : 0 });
      const near = ret(0.5);
      const far = ret(0.618);
      const tol = 0.3 * atrNow;
      const inZone = up ? c.low <= near && c.close >= far - tol : c.high >= near && c.close <= far + tol;
      out.goldenZone.push({ time: c.time, value: inZone ? 1 : 0 });
    }
  }
  return out;
}

// ---------- RSI and MACD with a chosen source / smoothing ----------

/** RSI on a chosen source, smoothed the standard Wilder way (0), with a simple average (1) or an exponential one (2). */
export function rsiEx(candles: Candle[], period = 14, source = 0, smoothing = 0): IndicatorPoint[] {
  const sc = withSource(candles, source);
  if (smoothing === 0) return rsi(sc, period);
  const out: IndicatorPoint[] = [];
  if (sc.length < period + 1) return out;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < sc.length; i++) {
    const ch = sc[i].close - sc[i - 1].close;
    gains.push(ch > 0 ? ch : 0);
    losses.push(ch < 0 ? -ch : 0);
  }
  const k = 2 / (period + 1);
  let avgG = 0;
  let avgL = 0;
  let last = 50;
  for (let i = period; i < sc.length; i++) {
    if (smoothing === 1 || i === period) {
      avgG = 0;
      avgL = 0;
      for (let j = i - period + 1; j <= i; j++) {
        avgG += gains[j];
        avgL += losses[j];
      }
      avgG /= period;
      avgL /= period;
    } else {
      avgG = gains[i] * k + avgG * (1 - k);
      avgL = losses[i] * k + avgL * (1 - k);
    }
    last = avgL === 0 ? (avgG === 0 ? last : 100) : 100 - 100 / (1 + avgG / avgL);
    out.push({ time: sc[i].time, value: last });
  }
  return out;
}

function smaOfSeries(points: IndicatorPoint[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  for (let i = period - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += points[j].value;
    out.push({ time: points[i].time, value: sum / period });
  }
  return out;
}

/** MACD on a chosen source, with EMAs (0, standard) or simple averages (1). */
export function macdEx(candles: Candle[], fast = 12, slow = 26, signal = 9, source = 0, maType = 0) {
  const sc = withSource(candles, source);
  if (maType === 0) return macd(sc, fast, slow, signal);
  const f = byTime(sma(sc, fast));
  const line: IndicatorPoint[] = sma(sc, slow)
    .filter((p) => f.has(p.time))
    .map((p) => ({ time: p.time, value: f.get(p.time)! - p.value }));
  const sig = smaOfSeries(line, signal);
  const lineBy = byTime(line);
  return { macd: line, signal: sig, histogram: sig.map((p) => ({ time: p.time, value: lineBy.get(p.time)! - p.value })) };
}

/** Percentage Price Oscillator: MACD as a percent of the slow average, so it can be compared across stocks and price levels. */
export function ppo(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const f = byTime(ema(candles, fast));
  const line: IndicatorPoint[] = [];
  for (const sl of ema(candles, slow)) {
    const fv = f.get(sl.time);
    if (fv === undefined || sl.value === 0) continue;
    line.push({ time: sl.time, value: ((fv - sl.value) / sl.value) * 100 });
  }
  const sig: IndicatorPoint[] = [];
  if (line.length >= signal) {
    const k = 2 / (signal + 1);
    let prev = line.slice(0, signal).reduce((a, p) => a + p.value, 0) / signal;
    sig.push({ time: line[signal - 1].time, value: prev });
    for (let i = signal; i < line.length; i++) {
      prev = line[i].value * k + prev * (1 - k);
      sig.push({ time: line[i].time, value: prev });
    }
  }
  const lineBy = byTime(line);
  return { line, signal: sig, histogram: sig.map((p) => ({ time: p.time, value: lineBy.get(p.time)! - p.value })) };
}

// ---------- Swing pivots, divergence, W-bottom / M-top ----------

export type Pivot = { index: number; price: number };

/** Pivot lows (or highs): the lowest low (highest high) of `left` candles before and `right` after. Only known `right` candles later. */
export function pricePivots(candles: Candle[], left: number, right: number, kind: "low" | "high"): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let ok = true;
    for (let j = i - left; j <= i + right && ok; j++) {
      if (j === i) continue;
      if (kind === "low" ? candles[j].low <= candles[i].low : candles[j].high >= candles[i].high) ok = false;
    }
    if (ok) out.push({ index: i, price: kind === "low" ? candles[i].low : candles[i].high });
  }
  return out;
}

/**
 * Divergence between price and an oscillator, as a 0/1 flag that is 1 only on the candle the divergence is confirmed.
 * Bullish: two consecutive pivot lows where price makes a lower low but the oscillator a higher low. Bearish is the mirror at highs.
 * The signal comes `right` candles after the second pivot (no look-ahead), and the pivots must be at most `maxBars` apart.
 */
export function divergenceFlags(candles: Candle[], osc: IndicatorPoint[], left: number, right: number, maxBars: number, bullish: boolean): IndicatorPoint[] {
  if (!osc.length) return [];
  const oscBy = byTime(osc);
  const flags = new Map<number, number>();
  const pivots = pricePivots(candles, left, right, bullish ? "low" : "high");
  for (let i = 1; i < pivots.length; i++) {
    const p1 = pivots[i - 1];
    const p2 = pivots[i];
    if (p2.index - p1.index > maxBars) continue;
    const o1 = oscBy.get(candles[p1.index].time);
    const o2 = oscBy.get(candles[p2.index].time);
    if (o1 === undefined || o2 === undefined) continue;
    const hit = bullish ? p2.price < p1.price && o2 > o1 : p2.price > p1.price && o2 < o1;
    if (hit) flags.set(p2.index + right, 1);
  }
  const first = osc[0].time;
  const out: IndicatorPoint[] = [];
  candles.forEach((c, i) => {
    if (c.time >= first) out.push({ time: c.time, value: flags.get(i) ?? 0 });
  });
  return out;
}

/**
 * Bollinger's own W-bottom (or M-top): the first low pierces or touches the lower band, the second low is higher and stays inside the band
 * (a higher %B), confirmed `right` candles after the second low. M-top is the mirror at the upper band. 1 on the confirming candle, else 0.
 */
export function bollingerWM(candles: Candle[], period: number, k: number, left: number, right: number, maxBars: number, top: boolean): IndicatorPoint[] {
  const b = bollingerBands(candles, period, k);
  if (!b.upper.length) return [];
  const up = byTime(b.upper);
  const lo = byTime(b.lower);
  const pctB = (price: number, time: number) => {
    const u = up.get(time);
    const l = lo.get(time);
    return u === undefined || l === undefined || u === l ? undefined : (price - l) / (u - l);
  };
  const flags = new Map<number, number>();
  const pivots = pricePivots(candles, left, right, top ? "high" : "low");
  for (let i = 1; i < pivots.length; i++) {
    const p1 = pivots[i - 1];
    const p2 = pivots[i];
    if (p2.index - p1.index > maxBars) continue;
    const b1 = pctB(p1.price, candles[p1.index].time);
    const b2 = pctB(p2.price, candles[p2.index].time);
    if (b1 === undefined || b2 === undefined) continue;
    const hit = top ? b1 >= 1 && b2 < 1 && b2 < b1 : b1 <= 0 && b2 > 0 && b2 > b1;
    if (hit) flags.set(p2.index + right, 1);
  }
  const first = b.upper[0].time;
  const out: IndicatorPoint[] = [];
  candles.forEach((c, i) => {
    if (c.time >= first) out.push({ time: c.time, value: flags.get(i) ?? 0 });
  });
  return out;
}

// ---------- Anchored VWAP variants ----------

const weekKey = (time: number) => Math.floor((sessionDay(time) + 3) / 7); // weeks start on Monday
const monthKey = (time: number) => {
  const d = new Date((time + 19_800) * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** VWAP that restarts at the start of every week or month (not every day). */
export function periodVwap(candles: Candle[], period: "week" | "month"): IndicatorPoint[] {
  const key = period === "week" ? weekKey : monthKey;
  const out: IndicatorPoint[] = [];
  let k = Number.NaN;
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const kk = key(c.time);
    if (kk !== k) {
      k = kk;
      pv = 0;
      vol = 0;
    }
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    vol += c.volume;
    if (vol > 0) out.push({ time: c.time, value: pv / vol });
  }
  return out;
}

/** VWAP anchored at a date given as YYYYMMDD (India time): the average price paid by everyone who bought since that day. */
export function vwapFromDate(candles: Candle[], yyyymmdd: number): IndicatorPoint[] {
  const y = Math.floor(yyyymmdd / 10_000);
  const m = Math.floor((yyyymmdd % 10_000) / 100);
  const d = yyyymmdd % 100;
  if (y < 1990 || m < 1 || m > 12 || d < 1 || d > 31) return [];
  const anchor = Date.UTC(y, m - 1, d) / 1000 - 19_800;
  const out: IndicatorPoint[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    if (c.time < anchor) continue;
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    vol += c.volume;
    if (vol > 0) out.push({ time: c.time, value: pv / vol });
  }
  return out;
}

/** VWAP anchored at the latest confirmed swing low (or high); moves to the next swing as soon as it is confirmed. */
export function vwapFromSwing(candles: Candle[], left: number, right: number, kind: "low" | "high"): IndicatorPoint[] {
  const pivotsByConfirm = new Map<number, number>();
  for (const p of pricePivots(candles, left, right, kind)) pivotsByConfirm.set(p.index + right, p.index);
  const out: IndicatorPoint[] = [];
  let anchor = -1;
  let pv = 0;
  let vol = 0;
  for (let t = 0; t < candles.length; t++) {
    const fresh = pivotsByConfirm.get(t);
    if (fresh !== undefined) {
      anchor = fresh;
      pv = 0;
      vol = 0;
      for (let j = anchor; j <= t; j++) {
        pv += ((candles[j].high + candles[j].low + candles[j].close) / 3) * candles[j].volume;
        vol += candles[j].volume;
      }
    } else if (anchor >= 0) {
      pv += ((candles[t].high + candles[t].low + candles[t].close) / 3) * candles[t].volume;
      vol += candles[t].volume;
    }
    if (anchor >= 0 && vol > 0) out.push({ time: candles[t].time, value: pv / vol });
  }
  return out;
}

// ---------- Manual Fibonacci (the user gives the swing prices) ----------

const FIB_RET = { 382: 0.382, 500: 0.5, 618: 0.618, 786: 0.786 } as const;
const FIB_EXT = { 1272: 1.272, 1618: 1.618 } as const;

/** A level from a swing the user types in: start price A and end price B (either direction). A flat line across the chart. */
export function manualFibLevel(candles: Candle[], start: number, end: number, ratio: keyof typeof FIB_RET | keyof typeof FIB_EXT): IndicatorPoint[] {
  const range = end - start;
  const value = ratio in FIB_RET ? end - FIB_RET[ratio as keyof typeof FIB_RET] * range : start + FIB_EXT[ratio as keyof typeof FIB_EXT] * range;
  return candles.map((c) => ({ time: c.time, value }));
}

/** 1 while a candle has pulled back into the 50%-61.8% zone of a swing the user typed in (within 0.3 ATR), else 0. */
export function manualFibGoldenZone(candles: Candle[], start: number, end: number): IndicatorPoint[] {
  const range = end - start;
  const near = end - 0.5 * range;
  const far = end - 0.618 * range;
  const up = range > 0;
  const atrBy = byTime(atr(candles, 14));
  const out: IndicatorPoint[] = [];
  for (const c of candles) {
    const a = atrBy.get(c.time);
    if (a === undefined) continue;
    const tol = 0.3 * a;
    out.push({ time: c.time, value: (up ? c.low <= near && c.close >= far - tol : c.high >= near && c.close <= far + tol) ? 1 : 0 });
  }
  return out;
}

// ---------- Opening range ----------

/** NSE regular session opens 09:15 IST. */
const SESSION_OPEN_MINUTE = 9 * 60 + 15;

/** Minute of the IST day (0-1439) a candle starts at. */
const istMinute = (time: number) => Math.floor(((time + 19_800) % 86_400) / 60);

/**
 * The opening range: the highest high (or lowest low) of the first `minutes` of each session, from 09:15 IST.
 * It has no value until that range is complete (a candle that starts at or after 09:15 + minutes), restarts every day, and is
 * never known earlier than it really was, so a breakout rule can't see the future. On daily or longer candles there is no range.
 */
export function openingRange(candles: Candle[], minutes = 15, kind: "high" | "low"): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  let day = Number.NaN;
  let value = Number.NaN;
  let complete = false;
  for (const c of candles) {
    const d = sessionDay(c.time);
    if (d !== day) {
      day = d;
      value = Number.NaN;
      complete = false;
    }
    const m = istMinute(c.time);
    if (m < SESSION_OPEN_MINUTE) continue; // before the open
    if (m < SESSION_OPEN_MINUTE + minutes) {
      const v = kind === "high" ? c.high : c.low;
      value = Number.isNaN(value) ? v : kind === "high" ? Math.max(value, v) : Math.min(value, v);
    } else if (!Number.isNaN(value)) {
      complete = true;
    }
    if (complete) out.push({ time: c.time, value });
  }
  return out;
}
