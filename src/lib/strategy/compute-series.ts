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
import {
  bollingerBandwidth,
  bollingerEx,
  bollingerPercentB,
  bollingerSqueeze,
  bollingerWM,
  changeOver,
  divergenceFlags,
  fibonacciLevels,
  keltnerSqueeze,
  macdEx,
  manualFibGoldenZone,
  openingRange,
  manualFibLevel,
  periodVwap,
  ppo,
  rsiEx,
  sessionVwap,
  vwapFromDate,
  vwapFromSwing,
} from "@/lib/indicators-study";
import type { IndicatorKind } from "./types";
import { INDICATOR_BY_KIND } from "./indicator-catalog";

/** Single dispatch point from a DSL/visual-builder indicator + its numeric
 * params to the underlying series in @/lib/indicators — shared by the
 * condition evaluator and the strategy chart overlay so they can never
 * drift apart on what an indicator actually computes. */
/** Settings that count bars (periods, lookbacks) — must be whole numbers ≥ 1. */
// (Source, Smoothing and Average type are picks from a list; 0 is the first choice.)
const COUNT_PARAM = /period|fast|slow|signal|strength|touches|left|right|lookback|bars|percentile|minutes/i;

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
      return rsiEx(candles, params[0], params[1], params[2]);
    case "MACD_LINE":
      return macdEx(candles, params[0], params[1], params[2], params[3], params[4]).macd;
    case "MACD_SIGNAL":
      return macdEx(candles, params[0], params[1], params[2], params[3], params[4]).signal;
    case "MACD_HISTOGRAM":
      return macdEx(candles, params[0], params[1], params[2], params[3], params[4]).histogram;
    case "BB_UPPER":
      return bollingerEx(candles, params[0], params[1], params[2], params[3]).upper;
    case "BB_MIDDLE":
      return bollingerEx(candles, params[0], params[1], params[2], params[3]).middle;
    case "BB_LOWER":
      return bollingerEx(candles, params[0], params[1], params[2], params[3]).lower;
    case "VWAP":
      return vwap(candles);
    case "VWAP_UPPER_1":
      return sessionVwap(candles).upper1;
    case "VWAP_LOWER_1":
      return sessionVwap(candles).lower1;
    case "VWAP_UPPER_2":
      return sessionVwap(candles).upper2;
    case "VWAP_LOWER_2":
      return sessionVwap(candles).lower2;
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
    case "BB_PERCENT_B":
      return bollingerPercentB(candles, params[0], params[1], params[2], params[3]);
    case "BB_BANDWIDTH":
      return bollingerBandwidth(candles, params[0], params[1], params[2], params[3]);
    case "BB_SQUEEZE":
      return bollingerSqueeze(candles, params[0], params[1], params[2], params[3]);
    case "BB_KC_SQUEEZE":
      return keltnerSqueeze(candles, params[0], params[1], params[2]);
    case "RSI_CHANGE":
      return changeOver(rsi(candles, params[0]), params[1]);
    case "MACD_HIST_CHANGE":
      return changeOver(macd(candles, params[0], params[1], params[2]).histogram, params[3]);
    case "BB_MIDDLE_CHANGE":
      return changeOver(sma(candles, params[0]), params[1]);
    case "FIB_RET_382":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ret382;
    case "FIB_RET_500":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ret500;
    case "FIB_RET_618":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ret618;
    case "FIB_RET_786":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ret786;
    case "FIB_EXT_1272":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ext1272;
    case "FIB_EXT_1618":
      return fibonacciLevels(candles, params[0], params[1], params[2]).ext1618;
    case "FIB_GOLDEN_ZONE":
      return fibonacciLevels(candles, params[0], params[1], params[2]).goldenZone;
    case "FIB_DIRECTION":
      return fibonacciLevels(candles, params[0], params[1], params[2]).direction;
    case "FIB_CONFLUENCE":
      return fibonacciLevels(candles, params[0], params[1], params[2]).confluence;
    case "FIB_SETUP_AGE":
      return fibonacciLevels(candles, params[0], params[1], params[2]).age;
    case "FIB_MANUAL_RET_382":
      return manualFibLevel(candles, params[0], params[1], 382);
    case "FIB_MANUAL_RET_500":
      return manualFibLevel(candles, params[0], params[1], 500);
    case "FIB_MANUAL_RET_618":
      return manualFibLevel(candles, params[0], params[1], 618);
    case "FIB_MANUAL_RET_786":
      return manualFibLevel(candles, params[0], params[1], 786);
    case "FIB_MANUAL_EXT_1272":
      return manualFibLevel(candles, params[0], params[1], 1272);
    case "FIB_MANUAL_EXT_1618":
      return manualFibLevel(candles, params[0], params[1], 1618);
    case "FIB_MANUAL_GOLDEN_ZONE":
      return manualFibGoldenZone(candles, params[0], params[1]);
    case "RSI_BULL_DIVERGENCE":
      return divergenceFlags(candles, rsiEx(candles, params[0]), params[1], params[2], params[3], true);
    case "RSI_BEAR_DIVERGENCE":
      return divergenceFlags(candles, rsiEx(candles, params[0]), params[1], params[2], params[3], false);
    case "MACD_BULL_DIVERGENCE":
      return divergenceFlags(candles, macdEx(candles, params[0], params[1], params[2]).macd, params[3], params[4], params[5], true);
    case "MACD_BEAR_DIVERGENCE":
      return divergenceFlags(candles, macdEx(candles, params[0], params[1], params[2]).macd, params[3], params[4], params[5], false);
    case "PPO_LINE":
      return ppo(candles, params[0], params[1], params[2]).line;
    case "PPO_SIGNAL":
      return ppo(candles, params[0], params[1], params[2]).signal;
    case "PPO_HISTOGRAM":
      return ppo(candles, params[0], params[1], params[2]).histogram;
    case "BB_W_BOTTOM":
      return bollingerWM(candles, params[0], params[1], params[2], params[3], params[4], false);
    case "BB_M_TOP":
      return bollingerWM(candles, params[0], params[1], params[2], params[3], params[4], true);
    case "OPENING_RANGE_HIGH":
      return openingRange(candles, params[0], "high");
    case "OPENING_RANGE_LOW":
      return openingRange(candles, params[0], "low");
    case "VWAP_WEEK":
      return periodVwap(candles, "week");
    case "VWAP_MONTH":
      return periodVwap(candles, "month");
    case "VWAP_FROM_DATE":
      return vwapFromDate(candles, params[0]);
    case "VWAP_SWING_LOW":
      return vwapFromSwing(candles, params[0], params[1], "low");
    case "VWAP_SWING_HIGH":
      return vwapFromSwing(candles, params[0], params[1], "high");
  }
}
