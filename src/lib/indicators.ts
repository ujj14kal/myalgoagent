import type { Candle } from "@/lib/market-data";

export interface IndicatorPoint {
  time: number;
  value: number;
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
