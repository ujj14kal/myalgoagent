import type { Candle } from "@/lib/market-data";

export type ChartPatternKind =
  | "HEAD_AND_SHOULDERS"
  | "INVERSE_HEAD_AND_SHOULDERS"
  | "DOUBLE_TOP"
  | "DOUBLE_BOTTOM"
  | "TRIPLE_TOP"
  | "TRIPLE_BOTTOM"
  | "ASCENDING_TRIANGLE"
  | "DESCENDING_TRIANGLE"
  | "SYMMETRICAL_TRIANGLE"
  | "RISING_WEDGE"
  | "FALLING_WEDGE"
  | "BULL_FLAG"
  | "BEAR_FLAG"
  | "PENNANT"
  | "RECTANGLE"
  | "CUP_AND_HANDLE"
  | "ROUNDING_BOTTOM"
  | "ROUNDING_TOP";

// Tunable thresholds — a single spot to retune if backtesting shows a
// pattern firing too often/rarely, without touching detector logic.
const SWING_LOOKBACK = 3; // bars on each side a swing high/low must beat, to confirm it
const MIN_SWING_PCT = 0.01; // a reversal must move at least 1% to count as a real swing (filters noise)
const PEAK_TOLERANCE_PCT = 0.02; // two peaks/troughs within 2% of each other count as "equal"
const HEAD_MARGIN_PCT = 0.01; // the head must clear both shoulders by at least 1%
const FLAT_SLOPE_PCT = 0.003; // per-bar slope below this counts as "flat" for triangle sides
const POLE_MIN_MOVE_PCT = 0.05; // a flag/pennant's pole must move at least 5% over its window
const POLE_WINDOW = 10; // bars examined for a pole move
const CONSOLIDATION_WINDOW = 8; // bars examined for the post-pole consolidation
const PENNANT_NARROWING_RATIO = 0.7; // pennant's second-half range must be tighter than this fraction of its first-half range
const ROUNDING_WINDOW = 30; // bars spanning a rounding bottom/top's whole bowl shape
const ROUNDING_MIN_DEPTH_PCT = 0.03; // the bowl must dip at least 3% below its starting level
const CUP_WINDOW = 30; // bars spanning the cup portion of a cup-and-handle
const HANDLE_WINDOW = 8; // bars spanning the handle portion
const CUP_RIM_TOLERANCE_PCT = 0.03; // the cup must recover to within 3% of its starting level
const HANDLE_MAX_DEPTH_RATIO = 0.5; // the handle's pullback must be shallower than half the cup's depth

interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Fractal/zigzag swing detector: bar `i` is a swing high if its high is the
 * max of the `lookback`-bar window on both sides (swing low analogously).
 * Candidates are then merged so swings strictly alternate high/low, dropping
 * any reversal that doesn't move at least `minSwingPct` (noise) and merging
 * consecutive same-type candidates into the single most extreme one.
 */
export function findSwingPoints(candles: Candle[], lookback = SWING_LOOKBACK, minSwingPct = MIN_SWING_PCT): SwingPoint[] {
  const candidates: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    if (candles[i].high === Math.max(...window.map((c) => c.high))) {
      candidates.push({ index: i, price: candles[i].high, type: "high" });
    }
    if (candles[i].low === Math.min(...window.map((c) => c.low))) {
      candidates.push({ index: i, price: candles[i].low, type: "low" });
    }
  }
  candidates.sort((a, b) => a.index - b.index);

  const confirmed: SwingPoint[] = [];
  for (const cand of candidates) {
    const last = confirmed[confirmed.length - 1];
    if (!last) {
      confirmed.push(cand);
      continue;
    }
    if (last.type === cand.type) {
      if ((cand.type === "high" && cand.price > last.price) || (cand.type === "low" && cand.price < last.price)) {
        confirmed[confirmed.length - 1] = cand;
      }
      continue;
    }
    if (Math.abs(cand.price - last.price) / last.price >= minSwingPct) confirmed.push(cand);
  }
  return confirmed;
}

/** Swings that were fully confirmable by bar `i` — a swing at index `j`
 * needs `lookback` bars after it to exist before it's "known," so anything
 * more recent than `i - lookback` isn't visible yet (no look-ahead). */
function knownSwingsAt(swings: SwingPoint[], i: number, lookback: number): SwingPoint[] {
  return swings.filter((s) => s.index <= i - lookback);
}

function withinTolerance(a: number, b: number, tolerancePct: number): boolean {
  return Math.abs(a - b) / ((a + b) / 2) <= tolerancePct;
}

function interpolateAt(p1: SwingPoint, p2: SwingPoint, atIndex: number): number {
  if (p2.index === p1.index) return p1.price;
  const slope = (p2.price - p1.price) / (p2.index - p1.index);
  return p1.price + slope * (atIndex - p1.index);
}

function slopePctPerBar(p1: SwingPoint, p2: SwingPoint): number {
  if (p2.index === p1.index) return 0;
  return (p2.price - p1.price) / p1.price / (p2.index - p1.index);
}

function tailTypesMatch(swings: SwingPoint[], types: ("high" | "low")[]): SwingPoint[] | null {
  if (swings.length < types.length) return null;
  const tail = swings.slice(-types.length);
  return tail.every((s, i) => s.type === types[i]) ? tail : null;
}

function detectDoubleTop(swings: SwingPoint[], candle: Candle): boolean {
  const tail = tailTypesMatch(swings, ["high", "low", "high"]);
  if (!tail) return false;
  const [h1, trough, h2] = tail;
  return withinTolerance(h1.price, h2.price, PEAK_TOLERANCE_PCT) && candle.close < trough.price;
}

function detectDoubleBottom(swings: SwingPoint[], candle: Candle): boolean {
  const tail = tailTypesMatch(swings, ["low", "high", "low"]);
  if (!tail) return false;
  const [l1, peak, l2] = tail;
  return withinTolerance(l1.price, l2.price, PEAK_TOLERANCE_PCT) && candle.close > peak.price;
}

function detectTripleTop(swings: SwingPoint[], candle: Candle): boolean {
  const tail = tailTypesMatch(swings, ["high", "low", "high", "low", "high"]);
  if (!tail) return false;
  const [h1, l1, h2, l2, h3] = tail;
  const peaksMatch =
    withinTolerance(h1.price, h2.price, PEAK_TOLERANCE_PCT) && withinTolerance(h2.price, h3.price, PEAK_TOLERANCE_PCT);
  return peaksMatch && candle.close < Math.min(l1.price, l2.price);
}

function detectTripleBottom(swings: SwingPoint[], candle: Candle): boolean {
  const tail = tailTypesMatch(swings, ["low", "high", "low", "high", "low"]);
  if (!tail) return false;
  const [l1, h1, l2, h2, l3] = tail;
  const troughsMatch =
    withinTolerance(l1.price, l2.price, PEAK_TOLERANCE_PCT) && withinTolerance(l2.price, l3.price, PEAK_TOLERANCE_PCT);
  return troughsMatch && candle.close > Math.max(h1.price, h2.price);
}

function detectHeadAndShoulders(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const tail = tailTypesMatch(swings, ["high", "low", "high", "low", "high"]);
  if (!tail) return false;
  const [ls, lowL, head, lowR, rs] = tail;
  const headClearsShoulders =
    head.price > ls.price * (1 + HEAD_MARGIN_PCT) && head.price > rs.price * (1 + HEAD_MARGIN_PCT);
  const shouldersMatch = withinTolerance(ls.price, rs.price, PEAK_TOLERANCE_PCT);
  if (!headClearsShoulders || !shouldersMatch) return false;
  const neckline = interpolateAt(lowL, lowR, index);
  return candle.close < neckline;
}

function detectInverseHeadAndShoulders(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const tail = tailTypesMatch(swings, ["low", "high", "low", "high", "low"]);
  if (!tail) return false;
  const [ls, highL, head, highR, rs] = tail;
  const headClearsShoulders =
    head.price < ls.price * (1 - HEAD_MARGIN_PCT) && head.price < rs.price * (1 - HEAD_MARGIN_PCT);
  const shouldersMatch = withinTolerance(ls.price, rs.price, PEAK_TOLERANCE_PCT);
  if (!headClearsShoulders || !shouldersMatch) return false;
  const neckline = interpolateAt(highL, highR, index);
  return candle.close > neckline;
}

interface TriangleSides {
  highs: [SwingPoint, SwingPoint];
  lows: [SwingPoint, SwingPoint];
}

function recentTriangleSides(swings: SwingPoint[]): TriangleSides | null {
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  return { highs: [highs[0], highs[1]], lows: [lows[0], lows[1]] };
}

function detectAscendingTriangle(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const sides = recentTriangleSides(swings);
  if (!sides) return false;
  const highSlope = slopePctPerBar(...sides.highs);
  const lowSlope = slopePctPerBar(...sides.lows);
  const flatTop = Math.abs(highSlope) <= FLAT_SLOPE_PCT;
  const risingBottom = lowSlope > FLAT_SLOPE_PCT;
  if (!flatTop || !risingBottom) return false;
  const resistance = interpolateAt(sides.highs[0], sides.highs[1], index);
  return candle.close > resistance;
}

function detectDescendingTriangle(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const sides = recentTriangleSides(swings);
  if (!sides) return false;
  const highSlope = slopePctPerBar(...sides.highs);
  const lowSlope = slopePctPerBar(...sides.lows);
  const flatBottom = Math.abs(lowSlope) <= FLAT_SLOPE_PCT;
  const fallingTop = highSlope < -FLAT_SLOPE_PCT;
  if (!flatBottom || !fallingTop) return false;
  const support = interpolateAt(sides.lows[0], sides.lows[1], index);
  return candle.close < support;
}

function detectSymmetricalTriangle(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const sides = recentTriangleSides(swings);
  if (!sides) return false;
  const highSlope = slopePctPerBar(...sides.highs);
  const lowSlope = slopePctPerBar(...sides.lows);
  const converging = highSlope < -FLAT_SLOPE_PCT && lowSlope > FLAT_SLOPE_PCT;
  if (!converging) return false;
  const resistance = interpolateAt(sides.highs[0], sides.highs[1], index);
  const support = interpolateAt(sides.lows[0], sides.lows[1], index);
  return candle.close > resistance || candle.close < support;
}

function detectWedge(swings: SwingPoint[], candle: Candle, index: number, rising: boolean): boolean {
  const sides = recentTriangleSides(swings);
  if (!sides) return false;
  const highSlope = slopePctPerBar(...sides.highs);
  const lowSlope = slopePctPerBar(...sides.lows);
  const sameDirection = rising ? highSlope > FLAT_SLOPE_PCT && lowSlope > FLAT_SLOPE_PCT : highSlope < -FLAT_SLOPE_PCT && lowSlope < -FLAT_SLOPE_PCT;
  if (!sameDirection) return false;

  const earliestIdx = Math.min(sides.highs[0].index, sides.lows[0].index);
  const latestKnownIdx = Math.max(sides.highs[1].index, sides.lows[1].index);
  const spreadAtStart = Math.abs(interpolateAt(...sides.highs, earliestIdx) - interpolateAt(...sides.lows, earliestIdx));
  const spreadAtEnd = Math.abs(interpolateAt(...sides.highs, latestKnownIdx) - interpolateAt(...sides.lows, latestKnownIdx));
  const converging = spreadAtEnd < spreadAtStart * 0.9; // range narrowed by at least 10%
  if (!converging) return false;

  const upperNow = interpolateAt(...sides.highs, index);
  const lowerNow = interpolateAt(...sides.lows, index);
  // Rising wedge breaks down (bearish), falling wedge breaks up (bullish).
  return rising ? candle.close < lowerNow : candle.close > upperNow;
}

/** Flag and Pennant share a pole-then-pause structure but differ in the
 * *shape* of the pause: a flag consolidates in a roughly parallel channel,
 * while a pennant's range visibly narrows into a small triangle (converging
 * trendlines) before the breakout. `shape` enforces that distinction rather
 * than treating them as the same detector. */
function detectFlagOrPennant(candles: Candle[], index: number, bullish: boolean, shape: "flag" | "pennant"): boolean {
  const poleStart = index - POLE_WINDOW - CONSOLIDATION_WINDOW;
  if (poleStart < 0) return false;

  const poleFrom = candles[poleStart].close;
  const poleTo = candles[poleStart + POLE_WINDOW].close;
  const poleMovePct = (poleTo - poleFrom) / poleFrom;
  const hasPole = bullish ? poleMovePct >= POLE_MIN_MOVE_PCT : poleMovePct <= -POLE_MIN_MOVE_PCT;
  if (!hasPole) return false;

  const consolidation = candles.slice(poleStart + POLE_WINDOW, index);
  if (consolidation.length < 2) return false;
  const consolidationHigh = Math.max(...consolidation.map((c) => c.high));
  const consolidationLow = Math.min(...consolidation.map((c) => c.low));
  const consolidationRangePct = (consolidationHigh - consolidationLow) / poleTo;
  // The pole should dwarf the consolidation range, or this is just a
  // continuation of the same trend rather than pole-then-pause.
  if (consolidationRangePct > Math.abs(poleMovePct) * 0.6) return false;

  const mid = Math.max(1, Math.floor(consolidation.length / 2));
  const firstHalf = consolidation.slice(0, mid);
  const secondHalf = consolidation.slice(mid);
  const firstRange = Math.max(...firstHalf.map((c) => c.high)) - Math.min(...firstHalf.map((c) => c.low));
  const secondRange = Math.max(...secondHalf.map((c) => c.high)) - Math.min(...secondHalf.map((c) => c.low));
  const narrows = firstRange > 0 && secondRange < firstRange * PENNANT_NARROWING_RATIO;
  if (shape === "pennant" && !narrows) return false;
  if (shape === "flag" && narrows) return false;

  const breakoutCandle = candles[index];
  return bullish ? breakoutCandle.close > consolidationHigh : breakoutCandle.close < consolidationLow;
}

/** A flat top and a flat bottom (unlike a triangle, where at least one side
 * slopes) with price oscillating between them — confirmed by a breakout
 * above resistance or below support. */
function detectRectangle(swings: SwingPoint[], candle: Candle, index: number): boolean {
  const sides = recentTriangleSides(swings);
  if (!sides) return false;
  const highSlope = slopePctPerBar(...sides.highs);
  const lowSlope = slopePctPerBar(...sides.lows);
  if (Math.abs(highSlope) > FLAT_SLOPE_PCT || Math.abs(lowSlope) > FLAT_SLOPE_PCT) return false;
  const resistance = interpolateAt(...sides.highs, index);
  const support = interpolateAt(...sides.lows, index);
  return candle.close > resistance || candle.close < support;
}

/** A wide, gradual U-shaped recovery, distinct from a Double Bottom's two
 * sharp, similar-depth lows: the window's low point sits roughly in the
 * middle, price genuinely declines into it and recovers out of it (not a
 * V-shaped snap-back), and closes back above where the decline started. */
function detectRoundingBottom(candles: Candle[], index: number): boolean {
  if (index < ROUNDING_WINDOW) return false;
  const window = candles.slice(index - ROUNDING_WINDOW, index + 1);
  const closes = window.map((c) => c.close);
  const startLevel = closes[0];
  const overallMin = Math.min(...closes);
  const minIdx = closes.indexOf(overallMin);
  const isRoughlyMiddle = minIdx > window.length * 0.25 && minIdx < window.length * 0.75;
  const depthPct = (startLevel - overallMin) / startLevel;
  const breakout = closes[closes.length - 1] > startLevel;
  return isRoughlyMiddle && depthPct >= ROUNDING_MIN_DEPTH_PCT && breakout;
}

/** Bearish mirror of Rounding Bottom: a wide, gradual dome-shaped top. */
function detectRoundingTop(candles: Candle[], index: number): boolean {
  if (index < ROUNDING_WINDOW) return false;
  const window = candles.slice(index - ROUNDING_WINDOW, index + 1);
  const closes = window.map((c) => c.close);
  const startLevel = closes[0];
  const overallMax = Math.max(...closes);
  const maxIdx = closes.indexOf(overallMax);
  const isRoughlyMiddle = maxIdx > window.length * 0.25 && maxIdx < window.length * 0.75;
  const heightPct = (overallMax - startLevel) / startLevel;
  const breakdown = closes[closes.length - 1] < startLevel;
  return isRoughlyMiddle && heightPct >= ROUNDING_MIN_DEPTH_PCT && breakdown;
}

/** A rounding-bottom-shaped "cup" followed by a short, noticeably shallower
 * pullback (the "handle") right below the cup's rim, confirmed by a
 * breakout above the handle's high. */
function detectCupAndHandle(candles: Candle[], index: number): boolean {
  const handleStart = index - HANDLE_WINDOW;
  if (handleStart - CUP_WINDOW < 0) return false;

  const cupWindow = candles.slice(handleStart - CUP_WINDOW, handleStart);
  const handleWindow = candles.slice(handleStart, index);
  if (cupWindow.length === 0 || handleWindow.length === 0) return false;

  const cupStart = cupWindow[0].close;
  const cupLow = Math.min(...cupWindow.map((c) => c.low));
  const cupDepthPct = (cupStart - cupLow) / cupStart;
  const cupEnd = cupWindow[cupWindow.length - 1].close;
  const cupRecovered = cupEnd >= cupStart * (1 - CUP_RIM_TOLERANCE_PCT);
  if (cupDepthPct < ROUNDING_MIN_DEPTH_PCT || !cupRecovered) return false;

  const handleHigh = Math.max(...handleWindow.map((c) => c.high));
  const handleLow = Math.min(...handleWindow.map((c) => c.low));
  const handleDepthPct = (handleHigh - handleLow) / handleHigh;
  const handleShallow = handleDepthPct < cupDepthPct * HANDLE_MAX_DEPTH_RATIO;
  if (!handleShallow) return false;

  return candles[index].close > handleHigh;
}

function detectAt(candles: Candle[], swings: SwingPoint[], i: number, pattern: ChartPatternKind): boolean {
  const candle = candles[i];
  const known = knownSwingsAt(swings, i, SWING_LOOKBACK);

  switch (pattern) {
    case "DOUBLE_TOP":
      return detectDoubleTop(known, candle);
    case "DOUBLE_BOTTOM":
      return detectDoubleBottom(known, candle);
    case "TRIPLE_TOP":
      return detectTripleTop(known, candle);
    case "TRIPLE_BOTTOM":
      return detectTripleBottom(known, candle);
    case "HEAD_AND_SHOULDERS":
      return detectHeadAndShoulders(known, candle, i);
    case "INVERSE_HEAD_AND_SHOULDERS":
      return detectInverseHeadAndShoulders(known, candle, i);
    case "ASCENDING_TRIANGLE":
      return detectAscendingTriangle(known, candle, i);
    case "DESCENDING_TRIANGLE":
      return detectDescendingTriangle(known, candle, i);
    case "SYMMETRICAL_TRIANGLE":
      return detectSymmetricalTriangle(known, candle, i);
    case "RISING_WEDGE":
      return detectWedge(known, candle, i, true);
    case "FALLING_WEDGE":
      return detectWedge(known, candle, i, false);
    case "BULL_FLAG":
      return detectFlagOrPennant(candles, i, true, "flag");
    case "PENNANT":
      return detectFlagOrPennant(candles, i, true, "pennant");
    case "BEAR_FLAG":
      return detectFlagOrPennant(candles, i, false, "flag");
    case "RECTANGLE":
      return detectRectangle(known, candle, i);
    case "CUP_AND_HANDLE":
      return detectCupAndHandle(candles, i);
    case "ROUNDING_BOTTOM":
      return detectRoundingBottom(candles, i);
    case "ROUNDING_TOP":
      return detectRoundingTop(candles, i);
  }
}

/** True on the bar a chart pattern's breakout/confirmation occurs, using
 * only swing points and candles knowable as of that bar (no look-ahead). */
export function computeChartPatternSeries(candles: Candle[], pattern: ChartPatternKind): boolean[] {
  const swings = findSwingPoints(candles);
  return candles.map((_, i) => detectAt(candles, swings, i, pattern));
}
