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
import type { IndicatorKind } from "./types";

/** Single dispatch point from a DSL/visual-builder indicator + its numeric
 * params to the underlying series in @/lib/indicators — shared by the
 * condition evaluator and the strategy chart overlay so they can never
 * drift apart on what an indicator actually computes. */
export function computeIndicatorSeries(candles: Candle[], type: IndicatorKind, params: number[]): IndicatorPoint[] {
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
