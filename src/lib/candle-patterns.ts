import type { Candle } from "@/lib/market-data";

export type CandlePatternKind =
  | "DOJI"
  | "HAMMER"
  | "INVERTED_HAMMER"
  | "SHOOTING_STAR"
  | "HANGING_MAN"
  | "MARUBOZU_BULLISH"
  | "MARUBOZU_BEARISH"
  | "BULLISH_ENGULFING"
  | "BEARISH_ENGULFING"
  | "BULLISH_HARAMI"
  | "BEARISH_HARAMI"
  | "TWEEZER_TOP"
  | "TWEEZER_BOTTOM"
  | "MORNING_STAR"
  | "EVENING_STAR"
  | "THREE_WHITE_SOLDIERS"
  | "THREE_BLACK_CROWS";

// Tunable shape thresholds — a single spot to adjust if backtesting shows a
// pattern firing too often/rarely, without hunting through detector logic.
const DOJI_MAX_BODY_RATIO = 0.1; // body <= 10% of the bar's total range
const LONG_WICK_MIN_RATIO = 2; // wick >= 2x body, for hammer/shooting-star shapes
const SHORT_WICK_MAX_RATIO = 0.3; // opposite wick <= 30% of body
const MARUBOZU_MAX_WICK_RATIO = 0.05; // each wick <= 5% of range
const TWEEZER_TOLERANCE_RATIO = 0.1; // matching highs/lows within 10% of the bar's average range
const STAR_MIDDLE_MAX_BODY_RATIO = 0.3; // middle candle's body <= 30% of the first candle's body
const SOLDIERS_MIN_BODY_RATIO = 0.3; // each soldier/crow body >= 30% of its own range, filters out tiny same-direction dojis

interface Anatomy {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  isBullish: boolean;
}

function anatomy(c: Candle): Anatomy {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return { body, range, upperWick, lowerWick, isBullish: c.close > c.open };
}

function isDoji(c: Candle): boolean {
  const { body, range } = anatomy(c);
  return range > 0 && body <= DOJI_MAX_BODY_RATIO * range;
}

function isHammerShape(c: Candle): boolean {
  const { body, range, upperWick, lowerWick } = anatomy(c);
  if (range === 0 || body === 0) return false;
  return lowerWick >= LONG_WICK_MIN_RATIO * body && upperWick <= SHORT_WICK_MAX_RATIO * body;
}

function isShootingStarShape(c: Candle): boolean {
  const { body, range, upperWick, lowerWick } = anatomy(c);
  if (range === 0 || body === 0) return false;
  return upperWick >= LONG_WICK_MIN_RATIO * body && lowerWick <= SHORT_WICK_MAX_RATIO * body;
}

function isMarubozu(c: Candle, bullish: boolean): boolean {
  const { range, upperWick, lowerWick, isBullish } = anatomy(c);
  if (range === 0 || isBullish !== bullish) return false;
  return upperWick <= MARUBOZU_MAX_WICK_RATIO * range && lowerWick <= MARUBOZU_MAX_WICK_RATIO * range;
}

function isBullishEngulfing(prev: Candle, cur: Candle): boolean {
  const p = anatomy(prev);
  const c = anatomy(cur);
  return !p.isBullish && c.isBullish && cur.open < prev.close && cur.close > prev.open;
}

function isBearishEngulfing(prev: Candle, cur: Candle): boolean {
  const p = anatomy(prev);
  const c = anatomy(cur);
  return p.isBullish && !c.isBullish && cur.open > prev.close && cur.close < prev.open;
}

function isBullishHarami(prev: Candle, cur: Candle): boolean {
  const p = anatomy(prev);
  const c = anatomy(cur);
  return !p.isBullish && c.isBullish && cur.open > prev.close && cur.close < prev.open;
}

function isBearishHarami(prev: Candle, cur: Candle): boolean {
  const p = anatomy(prev);
  const c = anatomy(cur);
  return p.isBullish && !c.isBullish && cur.open < prev.close && cur.close > prev.open;
}

function isTweezerTop(prev: Candle, cur: Candle): boolean {
  const avgRange = (anatomy(prev).range + anatomy(cur).range) / 2;
  if (avgRange === 0) return false;
  return Math.abs(cur.high - prev.high) <= TWEEZER_TOLERANCE_RATIO * avgRange && anatomy(prev).isBullish && !anatomy(cur).isBullish;
}

function isTweezerBottom(prev: Candle, cur: Candle): boolean {
  const avgRange = (anatomy(prev).range + anatomy(cur).range) / 2;
  if (avgRange === 0) return false;
  return Math.abs(cur.low - prev.low) <= TWEEZER_TOLERANCE_RATIO * avgRange && !anatomy(prev).isBullish && anatomy(cur).isBullish;
}

function isMorningStar(first: Candle, middle: Candle, third: Candle): boolean {
  const f = anatomy(first);
  const m = anatomy(middle);
  const t = anatomy(third);
  if (f.isBullish || !t.isBullish || f.body === 0) return false;
  const gappedDown = Math.max(middle.open, middle.close) < first.close;
  const closesAboveMidpoint = third.close > first.open - f.body / 2;
  return m.body <= STAR_MIDDLE_MAX_BODY_RATIO * f.body && gappedDown && closesAboveMidpoint;
}

function isEveningStar(first: Candle, middle: Candle, third: Candle): boolean {
  const f = anatomy(first);
  const m = anatomy(middle);
  const t = anatomy(third);
  if (!f.isBullish || t.isBullish || f.body === 0) return false;
  const gappedUp = Math.min(middle.open, middle.close) > first.close;
  const closesBelowMidpoint = third.close < first.open + f.body / 2;
  return m.body <= STAR_MIDDLE_MAX_BODY_RATIO * f.body && gappedUp && closesBelowMidpoint;
}

function isThreeWhiteSoldiers(a: Candle, b: Candle, c: Candle): boolean {
  const anatA = anatomy(a);
  const anatB = anatomy(b);
  const anatC = anatomy(c);
  if (!anatA.isBullish || !anatB.isBullish || !anatC.isBullish) return false;
  if (anatA.range === 0 || anatB.range === 0 || anatC.range === 0) return false;
  const sizeOk =
    anatA.body >= SOLDIERS_MIN_BODY_RATIO * anatA.range &&
    anatB.body >= SOLDIERS_MIN_BODY_RATIO * anatB.range &&
    anatC.body >= SOLDIERS_MIN_BODY_RATIO * anatC.range;
  const progression = b.open > a.open && b.open < a.close && b.close > a.close && c.open > b.open && c.open < b.close && c.close > b.close;
  return sizeOk && progression;
}

function isThreeBlackCrows(a: Candle, b: Candle, c: Candle): boolean {
  const anatA = anatomy(a);
  const anatB = anatomy(b);
  const anatC = anatomy(c);
  if (anatA.isBullish || anatB.isBullish || anatC.isBullish) return false;
  if (anatA.range === 0 || anatB.range === 0 || anatC.range === 0) return false;
  const sizeOk =
    anatA.body >= SOLDIERS_MIN_BODY_RATIO * anatA.range &&
    anatB.body >= SOLDIERS_MIN_BODY_RATIO * anatB.range &&
    anatC.body >= SOLDIERS_MIN_BODY_RATIO * anatC.range;
  const progression = b.open < a.open && b.open > a.close && b.close < a.close && c.open < b.open && c.open > b.close && c.close < b.close;
  return sizeOk && progression;
}

/** Detects `pattern` on bar `i`, given enough preceding bars exist. */
function detectAt(candles: Candle[], i: number, pattern: CandlePatternKind): boolean {
  const cur = candles[i];
  switch (pattern) {
    case "DOJI":
      return isDoji(cur);
    case "HAMMER":
      return isHammerShape(cur) && cur.close >= (cur.high + cur.low) / 2;
    case "HANGING_MAN":
      return isHammerShape(cur) && cur.close < (cur.high + cur.low) / 2;
    case "INVERTED_HAMMER":
      return isShootingStarShape(cur) && cur.close >= (cur.high + cur.low) / 2;
    case "SHOOTING_STAR":
      return isShootingStarShape(cur) && cur.close < (cur.high + cur.low) / 2;
    case "MARUBOZU_BULLISH":
      return isMarubozu(cur, true);
    case "MARUBOZU_BEARISH":
      return isMarubozu(cur, false);
    case "BULLISH_ENGULFING":
      return i >= 1 && isBullishEngulfing(candles[i - 1], cur);
    case "BEARISH_ENGULFING":
      return i >= 1 && isBearishEngulfing(candles[i - 1], cur);
    case "BULLISH_HARAMI":
      return i >= 1 && isBullishHarami(candles[i - 1], cur);
    case "BEARISH_HARAMI":
      return i >= 1 && isBearishHarami(candles[i - 1], cur);
    case "TWEEZER_TOP":
      return i >= 1 && isTweezerTop(candles[i - 1], cur);
    case "TWEEZER_BOTTOM":
      return i >= 1 && isTweezerBottom(candles[i - 1], cur);
    case "MORNING_STAR":
      return i >= 2 && isMorningStar(candles[i - 2], candles[i - 1], cur);
    case "EVENING_STAR":
      return i >= 2 && isEveningStar(candles[i - 2], candles[i - 1], cur);
    case "THREE_WHITE_SOLDIERS":
      return i >= 2 && isThreeWhiteSoldiers(candles[i - 2], candles[i - 1], cur);
    case "THREE_BLACK_CROWS":
      return i >= 2 && isThreeBlackCrows(candles[i - 2], candles[i - 1], cur);
  }
}

export function computeCandlePatternSeries(candles: Candle[], pattern: CandlePatternKind): boolean[] {
  return candles.map((_, i) => detectAt(candles, i, pattern));
}
