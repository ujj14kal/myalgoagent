import type { Candle } from "@/lib/market-data";

export interface IndicatorPoint {
  time: number;
  value: number;
}

function emaOfSeries(points: IndicatorPoint[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (points.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += points[i].value;
  let prev = seed / period;
  out.push({ time: points[period - 1].time, value: prev });

  for (let i = period; i < points.length; i++) {
    const value = points[i].value * k + prev * (1 - k);
    out.push({ time: points[i].time, value });
    prev = value;
  }
  return out;
}

function byTime(points: IndicatorPoint[]): Map<number, number> {
  return new Map(points.map((p) => [p.time, p.value]));
}

// Simple Moving Average
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    points.push({ time: candles[i].time, value: sum / period });
  }
  return points;
}

// Exponential Moving Average
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  if (candles.length < period) return points;

  const k = 2 / (period + 1);

  // Seed with the SMA of the first `period` closes.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += candles[i].close;
  let prevEma = seed / period;
  points.push({ time: candles[period - 1].time, value: prevEma });

  for (let i = period; i < candles.length; i++) {
    const value = candles[i].close * k + prevEma * (1 - k);
    points.push({ time: candles[i].time, value });
    prevEma = value;
  }

  return points;
}

// Relative Strength Index (Wilder's smoothing)
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  if (candles.length < period + 1) return points;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rsiAt = (avgG: number, avgL: number) =>
    avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);

  points.push({ time: candles[period].time, value: rsiAt(avgGain, avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    points.push({ time: candles[i].time, value: rsiAt(avgGain, avgLoss) });
  }

  return points;
}

// Moving Average Convergence Divergence
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: IndicatorPoint[] } {
  const fastEma = byTime(ema(candles, fast));
  const slowEma = ema(candles, slow);

  const macdLine: IndicatorPoint[] = slowEma
    .filter((p) => fastEma.has(p.time))
    .map((p) => ({ time: p.time, value: fastEma.get(p.time)! - p.value }));

  const signalLine = emaOfSeries(macdLine, signal);
  const signalByTime = byTime(signalLine);
  const histogram: IndicatorPoint[] = signalLine.map((p) => ({
    time: p.time,
    value: byTime(macdLine).get(p.time)! - p.value,
  }));

  return { macd: macdLine, signal: signalLine.filter((p) => signalByTime.has(p.time)), histogram };
}

// Bollinger Bands
export function bollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: IndicatorPoint[]; middle: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const middle = sma(candles, period);
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const mean = middle[i - period + 1].value;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (candles[j].close - mean) ** 2;
    }
    const std = Math.sqrt(variance / period);
    upper.push({ time: candles[i].time, value: mean + stdDevMultiplier * std });
    lower.push({ time: candles[i].time, value: mean - stdDevMultiplier * std });
  }

  return { upper, middle, lower };
}

// Volume Weighted Average Price — cumulative over the fetched range, a
// daily-bar approximation of true intraday VWAP (which needs intraday
// data this platform doesn't have yet).
export function vwap(candles: Candle[]): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
    points.push({ time: c.time, value: cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typicalPrice });
  }

  return points;
}

function trueRange(candles: Candle[], i: number): number {
  const prevClose = candles[i - 1].close;
  return Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prevClose), Math.abs(candles[i].low - prevClose));
}

// Average True Range (Wilder's smoothing)
export function atr(candles: Candle[], period = 14): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  if (candles.length < period + 1) return points;

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRange(candles, i);
  let prevAtr = sum / period;
  points.push({ time: candles[period].time, value: prevAtr });

  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trueRange(candles, i)) / period;
    points.push({ time: candles[i].time, value: prevAtr });
  }

  return points;
}

// Average Directional Index + Directional Movement Indicators (Wilder's smoothing)
export function adx(
  candles: Candle[],
  period = 14,
): { adx: IndicatorPoint[]; plusDI: IndicatorPoint[]; minusDI: IndicatorPoint[] } {
  const plusDI: IndicatorPoint[] = [];
  const minusDI: IndicatorPoint[] = [];
  const dxValues: IndicatorPoint[] = [];
  if (candles.length < period + 1) return { adx: [], plusDI, minusDI };

  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;

  for (let i = 1; i <= period; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    smoothedPlusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    smoothedMinusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    smoothedTR += trueRange(candles, i);
  }
  pushDI(period);

  for (let i = period + 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    smoothedTR = smoothedTR - smoothedTR / period + trueRange(candles, i);
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM;
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM;
    pushDI(i);
  }

  function pushDI(i: number) {
    const pDI = smoothedTR > 0 ? (100 * smoothedPlusDM) / smoothedTR : 0;
    const mDI = smoothedTR > 0 ? (100 * smoothedMinusDM) / smoothedTR : 0;
    plusDI.push({ time: candles[i].time, value: pDI });
    minusDI.push({ time: candles[i].time, value: mDI });
    const dx = pDI + mDI > 0 ? (100 * Math.abs(pDI - mDI)) / (pDI + mDI) : 0;
    dxValues.push({ time: candles[i].time, value: dx });
  }

  const adxLine = emaOfSeries(dxValues, period);
  return { adx: adxLine, plusDI, minusDI };
}

// Stochastic Oscillator
export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: IndicatorPoint[]; d: IndicatorPoint[] } {
  const k: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    k.push({ time: candles[i].time, value: range > 0 ? (100 * (candles[i].close - lowest)) / range : 50 });
  }

  const d: IndicatorPoint[] = [];
  for (let i = dPeriod - 1; i < k.length; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) sum += k[j].value;
    d.push({ time: k[i].time, value: sum / dPeriod });
  }

  return { k, d };
}

// Commodity Channel Index
export function cci(candles: Candle[], period = 20): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += typicalPrices[j];
    const meanTP = sum / period;

    let meanDeviation = 0;
    for (let j = i - period + 1; j <= i; j++) meanDeviation += Math.abs(typicalPrices[j] - meanTP);
    meanDeviation /= period;

    const value = meanDeviation > 0 ? (typicalPrices[i] - meanTP) / (0.015 * meanDeviation) : 0;
    points.push({ time: candles[i].time, value });
  }

  return points;
}

// Rate of Change / Momentum
export function roc(candles: Candle[], period = 12): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (let i = period; i < candles.length; i++) {
    const prev = candles[i - period].close;
    points.push({ time: candles[i].time, value: prev !== 0 ? ((candles[i].close - prev) / prev) * 100 : 0 });
  }
  return points;
}

// On-Balance Volume
export function obv(candles: Candle[]): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let cumulative = 0;
  points.push({ time: candles[0]?.time ?? 0, value: cumulative });

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) cumulative += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) cumulative -= candles[i].volume;
    points.push({ time: candles[i].time, value: cumulative });
  }

  return points;
}

// Donchian Channels
export function donchianChannels(candles: Candle[], period = 20): { upper: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    upper.push({ time: candles[i].time, value: highest });
    lower.push({ time: candles[i].time, value: lowest });
  }

  return { upper, lower };
}

// Standard floor Pivot Points, computed per bar from the *prior* bar's H/L/C
export function pivotPoints(
  candles: Candle[],
): { pp: IndicatorPoint[]; r1: IndicatorPoint[]; r2: IndicatorPoint[]; r3: IndicatorPoint[]; s1: IndicatorPoint[]; s2: IndicatorPoint[]; s3: IndicatorPoint[] } {
  const pp: IndicatorPoint[] = [];
  const r1: IndicatorPoint[] = [];
  const r2: IndicatorPoint[] = [];
  const r3: IndicatorPoint[] = [];
  const s1: IndicatorPoint[] = [];
  const s2: IndicatorPoint[] = [];
  const s3: IndicatorPoint[] = [];

  for (let i = 1; i < candles.length; i++) {
    const { high: H, low: L, close: C } = candles[i - 1];
    const P = (H + L + C) / 3;
    const time = candles[i].time;
    pp.push({ time, value: P });
    r1.push({ time, value: 2 * P - L });
    s1.push({ time, value: 2 * P - H });
    r2.push({ time, value: P + (H - L) });
    s2.push({ time, value: P - (H - L) });
    r3.push({ time, value: H + 2 * (P - L) });
    s3.push({ time, value: L - 2 * (H - P) });
  }

  return { pp, r1, r2, r3, s1, s2, s3 };
}

// Weighted Moving Average
export function wma(candles: Candle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - period + 1 + j].close * (j + 1);
    points.push({ time: candles[i].time, value: sum / denom });
  }
  return points;
}

// Hull Moving Average — a WMA-of-WMAs designed to reduce lag
export function hma(candles: Candle[], period: number): IndicatorPoint[] {
  const half = Math.max(1, Math.round(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  const wmaHalf = byTime(wma(candles, half));
  const wmaFull = wma(candles, period);
  const rawSeries: IndicatorPoint[] = wmaFull.filter((p) => wmaHalf.has(p.time)).map((p) => ({
    time: p.time,
    value: 2 * wmaHalf.get(p.time)! - p.value,
  }));

  if (rawSeries.length < sqrtPeriod) return [];
  const denom = (sqrtPeriod * (sqrtPeriod + 1)) / 2;
  const points: IndicatorPoint[] = [];
  for (let i = sqrtPeriod - 1; i < rawSeries.length; i++) {
    let sum = 0;
    for (let j = 0; j < sqrtPeriod; j++) sum += rawSeries[i - sqrtPeriod + 1 + j].value * (j + 1);
    points.push({ time: rawSeries[i].time, value: sum / denom });
  }
  return points;
}

// Parabolic SAR
export function parabolicSar(candles: Candle[], step = 0.02, max = 0.2): IndicatorPoint[] {
  if (candles.length < 2) return [];
  const points: IndicatorPoint[] = [];

  let isUptrend = candles[1].close >= candles[0].close;
  let sar = isUptrend ? candles[0].low : candles[0].high;
  let extremePoint = isUptrend ? candles[0].high : candles[0].low;
  let accel = step;

  for (let i = 1; i < candles.length; i++) {
    sar = sar + accel * (extremePoint - sar);

    if (isUptrend) {
      sar = Math.min(sar, candles[i - 1].low, i >= 2 ? candles[i - 2].low : candles[i - 1].low);
      if (candles[i].low < sar) {
        isUptrend = false;
        sar = extremePoint;
        extremePoint = candles[i].low;
        accel = step;
      } else if (candles[i].high > extremePoint) {
        extremePoint = candles[i].high;
        accel = Math.min(accel + step, max);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, i >= 2 ? candles[i - 2].high : candles[i - 1].high);
      if (candles[i].high > sar) {
        isUptrend = true;
        sar = extremePoint;
        extremePoint = candles[i].high;
        accel = step;
      } else if (candles[i].low < extremePoint) {
        extremePoint = candles[i].low;
        accel = Math.min(accel + step, max);
      }
    }

    points.push({ time: candles[i].time, value: sar });
  }

  return points;
}

// Supertrend — ATR-based trend-following stop line
export function supertrend(candles: Candle[], period = 10, multiplier = 3): IndicatorPoint[] {
  const atrValues = atr(candles, period);
  if (atrValues.length === 0) return [];

  const startIdx = candles.length - atrValues.length;
  const points: IndicatorPoint[] = [];
  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let prevSupertrend = 0;
  let started = false;

  for (let k = 0; k < atrValues.length; k++) {
    const i = startIdx + k;
    const c = candles[i];
    const a = atrValues[k].value;
    const prevClose = i > 0 ? candles[i - 1].close : c.close;

    const basicUpper = (c.high + c.low) / 2 + multiplier * a;
    const basicLower = (c.high + c.low) / 2 - multiplier * a;

    const upperBand = !started || basicUpper < prevUpperBand || prevClose > prevUpperBand ? basicUpper : prevUpperBand;
    const lowerBand = !started || basicLower > prevLowerBand || prevClose < prevLowerBand ? basicLower : prevLowerBand;

    let isUptrend: boolean;
    if (!started) {
      isUptrend = c.close >= (basicUpper + basicLower) / 2;
    } else if (prevSupertrend === prevUpperBand) {
      isUptrend = c.close > upperBand;
    } else {
      isUptrend = c.close >= lowerBand;
    }

    const value = isUptrend ? lowerBand : upperBand;
    points.push({ time: c.time, value });

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
    prevSupertrend = value;
    started = true;
  }

  return points;
}

// Williams %R
export function williamsR(candles: Candle[], period = 14): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    points.push({ time: candles[i].time, value: range > 0 ? (-100 * (highest - candles[i].close)) / range : -50 });
  }
  return points;
}

// Money Flow Index — volume-weighted RSI
export function mfi(candles: Candle[], period = 14): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rawMoneyFlow = candles.map((c, i) => typicalPrices[i] * c.volume);

  for (let i = period; i < candles.length; i++) {
    let positiveFlow = 0;
    let negativeFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrices[j] > typicalPrices[j - 1]) positiveFlow += rawMoneyFlow[j];
      else if (typicalPrices[j] < typicalPrices[j - 1]) negativeFlow += rawMoneyFlow[j];
    }
    const value = negativeFlow > 0 ? 100 - 100 / (1 + positiveFlow / negativeFlow) : 100;
    points.push({ time: candles[i].time, value });
  }
  return points;
}

// Awesome Oscillator — SMA(5) of midpoint minus SMA(34) of midpoint
export function awesomeOscillator(candles: Candle[]): IndicatorPoint[] {
  const midpoints = candles.map((c) => (c.high + c.low) / 2);
  const smaOf = (period: number) => {
    const out: IndicatorPoint[] = [];
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += midpoints[j];
      out.push({ time: candles[i].time, value: sum / period });
    }
    return out;
  };
  const fast = byTime(smaOf(5));
  const slow = smaOf(34);
  return slow.filter((p) => fast.has(p.time)).map((p) => ({ time: p.time, value: fast.get(p.time)! - p.value }));
}

// Aroon Up / Aroon Down
export function aroon(candles: Candle[], period = 25): { up: IndicatorPoint[]; down: IndicatorPoint[] } {
  const up: IndicatorPoint[] = [];
  const down: IndicatorPoint[] = [];

  for (let i = period; i < candles.length; i++) {
    let highestIdx = i - period;
    let lowestIdx = i - period;
    for (let j = i - period; j <= i; j++) {
      if (candles[j].high >= candles[highestIdx].high) highestIdx = j;
      if (candles[j].low <= candles[lowestIdx].low) lowestIdx = j;
    }
    up.push({ time: candles[i].time, value: (100 * (period - (i - highestIdx))) / period });
    down.push({ time: candles[i].time, value: (100 * (period - (i - lowestIdx))) / period });
  }

  return { up, down };
}

// Chaikin Money Flow
export function chaikinMoneyFlow(candles: Candle[], period = 20): IndicatorPoint[] {
  const moneyFlowVolume = candles.map((c) => {
    const range = c.high - c.low;
    const multiplier = range > 0 ? (c.close - c.low - (c.high - c.close)) / range : 0;
    return multiplier * c.volume;
  });

  const points: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let mfvSum = 0;
    let volSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      mfvSum += moneyFlowVolume[j];
      volSum += candles[j].volume;
    }
    points.push({ time: candles[i].time, value: volSum > 0 ? mfvSum / volSum : 0 });
  }
  return points;
}

// Keltner Channels — EMA middle line +/- ATR multiple
export function keltnerChannels(
  candles: Candle[],
  period = 20,
  atrMultiplier = 2,
): { upper: IndicatorPoint[]; middle: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const middle = ema(candles, period);
  const atrByTime = byTime(atr(candles, period));

  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  const filteredMiddle: IndicatorPoint[] = [];

  for (const p of middle) {
    const a = atrByTime.get(p.time);
    if (a === undefined) continue;
    filteredMiddle.push(p);
    upper.push({ time: p.time, value: p.value + atrMultiplier * a });
    lower.push({ time: p.time, value: p.value - atrMultiplier * a });
  }

  return { upper, middle: filteredMiddle, lower };
}

// Envelope — SMA +/- a fixed percentage band
export function envelope(candles: Candle[], period = 20, percent = 2.5): { upper: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const middle = sma(candles, period);
  return {
    upper: middle.map((p) => ({ time: p.time, value: p.value * (1 + percent / 100) })),
    lower: middle.map((p) => ({ time: p.time, value: p.value * (1 - percent / 100) })),
  };
}

// Standard Deviation of closing price
export function standardDeviation(candles: Candle[], period = 20): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (candles[j].close - mean) ** 2;
    points.push({ time: candles[i].time, value: Math.sqrt(variance / period) });
  }
  return points;
}
