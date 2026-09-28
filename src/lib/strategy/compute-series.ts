import type { Candle } from "@/lib/market-data";
import type { IndicatorPoint } from "@/lib/indicators";
import {
  sma,
  ema,
  wma,
  hma,
  rsi,
  macd,
  bollingerBands,
  vwap,
  atr,
  adx,
  stochastic,
  cci,
  roc,
  obv,
  donchianChannels,
  pivotPoints,
  parabolicSar,
  supertrend,
  williamsR,
  mfi,
  awesomeOscillator,
  aroon,
  chaikinMoneyFlow,
  keltnerChannels,
  envelope,
  standardDeviation,
} from "@/lib/indicators";
import { supportResistance } from "@/lib/support-resistance";
import type { IndicatorKind } from "./types";
import { INDICATOR_BY_KIND } from "./indicator-catalog";

/** Single dispatch point from a DSL/visual-builder indicator + its numeric
 * params to the underlying series in @/lib/indicators — shared by the
 * condition evaluator and the strategy chart overlay so they can never
 * drift apart on what an indicator actually computes. */
/** Settings that count bars (periods, lookbacks) — must be whole numbers ≥ 1. */
const COUNT_PARAM = /period|fast|slow|signal|strength|touches/i;

/**
 * Settings as typed by a user can be blank, 0 or nonsense (the chart lets
 * them edit periods freely). Missing ones fall back to the defaults; a
 * setting no indicator can use means "nothing to draw" rather than a crash.
 */
function usableParams(type: IndicatorKind, params: number[]): number[] | null {
  const def = INDICATOR_BY_KIND.get(type);
  if (!def) return params;
  const out: number[] = [];
  for (let i = 0; i < def.defaults.length; i++) {
    const v = params[i] ?? def.defaults[i];
    if (!Number.isFinite(v)) return null;
    if (COUNT_PARAM.test(def.paramLabels[i] ?? "")) {
      if (v < 1) return null;
      out.push(Math.round(v));
    } else {
      if (v < 0) return null;
      out.push(v);
    }
  }
  return out;
}

export function computeIndicatorSeries(candles: Candle[], type: IndicatorKind, rawParams: number[]): IndicatorPoint[] {
  const params = usableParams(type, rawParams);
  if (!params) return [];
  switch (type) {
    case "SMA":
      return sma(candles, params[0]);
    case "EMA":
      return ema(candles, params[0]);
    case "WMA":
      return wma(candles, params[0]);
    case "HMA":
      return hma(candles, params[0]);
    case "RSI":
      return rsi(candles, params[0]);
    case "MACD_LINE":
      return macd(candles, params[0], params[1], params[2]).macd;
    case "MACD_SIGNAL":
      return macd(candles, params[0], params[1], params[2]).signal;
    case "MACD_HISTOGRAM":
      return macd(candles, params[0], params[1], params[2]).histogram;
    case "BB_UPPER":
      return bollingerBands(candles, params[0], params[1]).upper;
    case "BB_MIDDLE":
      return bollingerBands(candles, params[0], params[1]).middle;
    case "BB_LOWER":
      return bollingerBands(candles, params[0], params[1]).lower;
    case "VWAP":
      return vwap(candles);
    case "ATR":
      return atr(candles, params[0]);
    case "ADX":
      return adx(candles, params[0]).adx;
    case "PLUS_DI":
      return adx(candles, params[0]).plusDI;
    case "MINUS_DI":
      return adx(candles, params[0]).minusDI;
    case "STOCH_K":
      return stochastic(candles, params[0], params[1]).k;
    case "STOCH_D":
      return stochastic(candles, params[0], params[1]).d;
    case "CCI":
      return cci(candles, params[0]);
    case "ROC":
      return roc(candles, params[0]);
    case "OBV":
      return obv(candles);
    case "DONCHIAN_UPPER":
      return donchianChannels(candles, params[0]).upper;
    case "DONCHIAN_LOWER":
      return donchianChannels(candles, params[0]).lower;
    case "PIVOT_PP":
      return pivotPoints(candles).pp;
    case "PIVOT_R1":
      return pivotPoints(candles).r1;
    case "PIVOT_R2":
      return pivotPoints(candles).r2;
    case "PIVOT_R3":
      return pivotPoints(candles).r3;
    case "PIVOT_S1":
      return pivotPoints(candles).s1;
    case "PIVOT_S2":
      return pivotPoints(candles).s2;
    case "PIVOT_S3":
      return pivotPoints(candles).s3;
    case "SUPPORT":
      return supportResistance(candles, params[0], params[1], params[2]).support;
    case "RESISTANCE":
      return supportResistance(candles, params[0], params[1], params[2]).resistance;
    case "PSAR":
      return parabolicSar(candles, params[0], params[1]);
    case "SUPERTREND":
      return supertrend(candles, params[0], params[1]);
    case "WILLIAMS_R":
      return williamsR(candles, params[0]);
    case "MFI":
      return mfi(candles, params[0]);
    case "AWESOME_OSCILLATOR":
      return awesomeOscillator(candles);
    case "AROON_UP":
      return aroon(candles, params[0]).up;
    case "AROON_DOWN":
      return aroon(candles, params[0]).down;
    case "CMF":
      return chaikinMoneyFlow(candles, params[0]);
    case "KELTNER_UPPER":
      return keltnerChannels(candles, params[0], params[1]).upper;
    case "KELTNER_MIDDLE":
      return keltnerChannels(candles, params[0], params[1]).middle;
    case "KELTNER_LOWER":
      return keltnerChannels(candles, params[0], params[1]).lower;
    case "ENVELOPE_UPPER":
      return envelope(candles, params[0], params[1]).upper;
    case "ENVELOPE_LOWER":
      return envelope(candles, params[0], params[1]).lower;
    case "STDDEV":
      return standardDeviation(candles, params[0]);
  }
}
