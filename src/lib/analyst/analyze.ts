import { adx, atr, bollingerBands, cci, ema, macd, mfi, obv, rsi, roc, sma, stochastic, supertrend, type IndicatorPoint } from "@/lib/indicators";
import { findSwingPoints } from "@/lib/chart-patterns";
import type { Candle } from "@/lib/market-data";

// Analyst Pro: reads a stock's daily candles through a fixed set of well-known technical indicators and shows, for each one,
// what it says (up, down or neutral) and how much weight it carries. Every number comes from the candles — nothing is hidden or
// guessed. The percentages are only a tally of how many weighted indicators lean each way: they describe the chart today and
// are not a forecast or a recommendation.

export type Lean = "up" | "down" | "neutral";
export type Group = "Trend" | "Momentum" | "Volume" | "Volatility";

export type Factor = { name: string; group: Group; lean: Lean; weight: number; reading: string };
export type Level = { price: number; distancePct: number };
/** A price where the chart has reacted before or where a move would be confirmed: a spot to watch, never an instruction. */
export type EntrySpot = { label: string; side: "long" | "short"; kind: "pullback" | "breakout"; price: number; distancePct: number; basis: string };
export type Analysis = {
  asOf: number;
  close: number;
  factors: Factor[];
  upPct: number;
  downPct: number;
  neutralPct: number;
  verdict: "Mostly up" | "Leaning up" | "Mixed" | "Leaning down" | "Mostly down";
  support: Level[];
  resistance: Level[];
  /** The nearest spots to watch on each side, from the same swing levels and moving averages. */
  entrySpots: EntrySpot[];
  /** Average daily range over 14 days, in rupees and as a share of the close, to give the moves some scale. */
  atr: { value: number; pct: number } | null;
  warnings: string[];
};

export const MIN_CANDLES = 60;

const last = (p: IndicatorPoint[]) => (p.length ? p[p.length - 1].value : null);
const at = (p: IndicatorPoint[], back: number) => (p.length > back ? p[p.length - 1 - back].value : null);
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function analyze(candles: Candle[]): Analysis | null {
  if (candles.length < MIN_CANDLES) return null;
  const close = candles[candles.length - 1].close;
  const factors: Factor[] = [];
  const add = (name: string, group: Group, weight: number, lean: Lean, reading: string) => factors.push({ name, group, lean, weight, reading });
  const warnings: string[] = [];

  // Trend — where the price sits against its moving averages.
  for (const [period, weight] of [[20, 1], [50, 1.5], [200, 2]] as const) {
    const v = last(sma(candles, period));
    if (v === null) continue;
    const lean: Lean = close > v * 1.005 ? "up" : close < v * 0.995 ? "down" : "neutral";
    add(`Price vs ${period}-day average`, "Trend", weight, lean, `Close ${inr(close)} is ${lean === "neutral" ? "right at" : lean === "up" ? "above" : "below"} the ${period}-day average of ${inr(v)}.`);
  }
  const s50 = last(sma(candles, 50));
  const s200 = last(sma(candles, 200));
  if (s50 !== null && s200 !== null) {
    const lean: Lean = s50 > s200 ? "up" : "down";
    add("50-day vs 200-day average", "Trend", 1.5, lean, `The 50-day average (${inr(s50)}) is ${lean === "up" ? "above" : "below"} the 200-day (${inr(s200)}).`);
  }
  const st = supertrend(candles, 10, 3);
  const stNow = last(st);
  if (stNow !== null) {
    const lean: Lean = close > stNow ? "up" : "down";
    add("Supertrend (10, 3)", "Trend", 1.5, lean, `Price is ${lean === "up" ? "above" : "below"} the Supertrend line at ${inr(stNow)}.`);
  }
  const dmi = adx(candles, 14);
  const adxNow = last(dmi.adx);
  const plus = last(dmi.plusDI);
  const minus = last(dmi.minusDI);
  if (adxNow !== null && plus !== null && minus !== null) {
    const strong = adxNow >= 25;
    const lean: Lean = !strong ? "neutral" : plus > minus ? "up" : "down";
    add("ADX trend strength (14)", "Trend", 1.5, lean, strong ? `ADX ${adxNow.toFixed(0)} shows a firm trend, with ${plus > minus ? "buyers (+DI)" : "sellers (−DI)"} ahead.` : `ADX ${adxNow.toFixed(0)} is under 25, so there is no firm trend either way.`);
  }

  // Momentum
  const r = last(rsi(candles, 14));
  if (r !== null) {
    const lean: Lean = r >= 55 && r <= 70 ? "up" : r <= 45 && r >= 30 ? "down" : "neutral";
    add("RSI (14)", "Momentum", 1.5, lean, r > 70 ? `RSI ${r.toFixed(0)} is above 70 — stretched, which often cools off.` : r < 30 ? `RSI ${r.toFixed(0)} is below 30 — stretched down, which often bounces.` : `RSI is ${r.toFixed(0)}: ${lean === "up" ? "positive momentum" : lean === "down" ? "negative momentum" : "no clear momentum"}.`);
    if (r > 70) warnings.push("RSI is above 70: the move up is stretched.");
    if (r < 30) warnings.push("RSI is below 30: the move down is stretched.");
  }
  const m = macd(candles);
  const hist = last(m.histogram);
  const histPrev = at(m.histogram, 1);
  const macdLine = last(m.macd);
  if (hist !== null && macdLine !== null) {
    const rising = histPrev !== null && hist > histPrev;
    const lean: Lean = hist > 0 ? "up" : hist < 0 ? "down" : "neutral";
    add("MACD (12, 26, 9)", "Momentum", 1.5, lean, `The MACD line is ${macdLine > 0 ? "above" : "below"} zero and its histogram is ${hist > 0 ? "positive" : "negative"} and ${rising ? "growing" : "shrinking"}.`);
  }
  const stoch = stochastic(candles, 14, 3);
  const k = last(stoch.k);
  const d = last(stoch.d);
  if (k !== null && d !== null) {
    const lean: Lean = k > 80 || k < 20 ? "neutral" : k > d ? "up" : "down";
    add("Stochastic (14, 3)", "Momentum", 1, lean, k > 80 ? `%K ${k.toFixed(0)} is above 80 — stretched up.` : k < 20 ? `%K ${k.toFixed(0)} is below 20 — stretched down.` : `%K ${k.toFixed(0)} is ${k > d ? "above" : "below"} %D ${d.toFixed(0)}.`);
  }
  const rc = last(roc(candles, 12));
  if (rc !== null) add("Rate of change (12)", "Momentum", 1, rc > 1 ? "up" : rc < -1 ? "down" : "neutral", `Price is ${rc >= 0 ? "up" : "down"} ${Math.abs(rc).toFixed(1)}% over 12 days.`);
  const c = last(cci(candles, 20));
  if (c !== null) add("CCI (20)", "Momentum", 1, c > 100 ? "up" : c < -100 ? "down" : "neutral", `CCI ${c.toFixed(0)}: ${c > 100 ? "strongly above its norm" : c < -100 ? "strongly below its norm" : "within its normal range"}.`);

  // Volume
  const o = obv(candles);
  const oNow = last(o);
  const oBack = at(o, 10);
  if (oNow !== null && oBack !== null) {
    const lean: Lean = oNow > oBack ? "up" : oNow < oBack ? "down" : "neutral";
    add("On-balance volume (10 days)", "Volume", 1, lean, `Volume flow has been ${lean === "up" ? "building (more volume on up days)" : lean === "down" ? "draining (more volume on down days)" : "flat"} over 10 days.`);
  }
  const mf = last(mfi(candles, 14));
  if (mf !== null) add("Money flow (14)", "Volume", 1, mf >= 55 && mf <= 80 ? "up" : mf <= 45 && mf >= 20 ? "down" : "neutral", `Money-flow index ${mf.toFixed(0)}${mf > 80 ? " — stretched up" : mf < 20 ? " — stretched down" : ""}.`);

  // Volatility / position in range
  const bb = bollingerBands(candles, 20, 2);
  const up = last(bb.upper);
  const lo = last(bb.lower);
  const mid = last(bb.middle);
  if (up !== null && lo !== null && mid !== null && up > lo) {
    const pctB = (close - lo) / (up - lo);
    const lean: Lean = pctB > 1 || pctB < 0 ? "neutral" : pctB > 0.55 ? "up" : pctB < 0.45 ? "down" : "neutral";
    add("Bollinger position (20, 2)", "Volatility", 1, lean, pctB > 1 ? "Price is above the upper band — stretched up." : pctB < 0 ? "Price is below the lower band — stretched down." : `Price sits ${Math.round(pctB * 100)}% of the way from the lower to the upper band.`);
  }
  const a = last(atr(candles, 14));

  const total = factors.reduce((s, f) => s + f.weight, 0);
  const pct = (l: Lean) => Math.round((factors.filter((f) => f.lean === l).reduce((s, f) => s + f.weight, 0) / total) * 100);
  let upPct = pct("up");
  const downPct = pct("down");
  const neutralPct = Math.max(0, 100 - upPct - downPct);
  if (upPct + downPct + neutralPct !== 100) upPct += 100 - upPct - downPct - neutralPct;
  const edge = upPct - downPct;
  const verdict = edge >= 40 ? "Mostly up" : edge >= 15 ? "Leaning up" : edge <= -40 ? "Mostly down" : edge <= -15 ? "Leaning down" : "Mixed";

  // Nearest swing prices on each side of today's close.
  const swings = findSwingPoints(candles);
  const levelOf = (price: number): Level => ({ price, distancePct: ((price - close) / close) * 100 });
  const support = swings.filter((s) => s.type === "low" && s.price < close).map((s) => s.price).sort((x, y) => y - x).slice(0, 3).map(levelOf);
  const resistance = swings.filter((s) => s.type === "high" && s.price > close).map((s) => s.price).sort((x, y) => x - y).slice(0, 3).map(levelOf);

  // Nearest possible entry spots: where price has turned before (swing levels, 20/50-day averages) and the levels whose break would confirm a move.
  const spots: EntrySpot[] = [];
  const spot = (label: string, side: EntrySpot["side"], kind: EntrySpot["kind"], price: number, basis: string) => spots.push({ label, side, kind, price, distancePct: ((price - close) / close) * 100, basis });
  if (support[0]) spot("Pullback to support", "long", "pullback", support[0].price, "The nearest recent swing low below the close, a level price has turned up from before.");
  const e20 = last(ema(candles, 20));
  const e50 = last(ema(candles, 50));
  for (const [n, v] of [[20, e20], [50, e50]] as const) {
    if (v !== null && v < close * 0.998) spot(`Pullback to ${n}-day average`, "long", "pullback", v, `The ${n}-day exponential average sits below the close and often acts as a support in a rising trend.`);
    if (v !== null && v > close * 1.002) spot(`Bounce into ${n}-day average`, "short", "pullback", v, `The ${n}-day exponential average sits above the close and often acts as a resistance in a falling trend.`);
  }
  if (resistance[0]) spot("Break above resistance", "long", "breakout", resistance[0].price, "The nearest recent swing high above the close. A close beyond it is what a breakout reading looks for.");
  if (resistance[0]) spot("Rejection at resistance", "short", "pullback", resistance[0].price, "The same swing high seen from below: a level price has turned down from before.");
  if (support[0]) spot("Break below support", "short", "breakout", support[0].price, "The nearest recent swing low. A close beneath it is what a breakdown reading looks for.");
  const entrySpots = spots.sort((x, y) => Math.abs(x.distancePct) - Math.abs(y.distancePct)).slice(0, 6);

  return {
    asOf: candles[candles.length - 1].time,
    close,
    factors,
    upPct,
    downPct,
    neutralPct,
    verdict,
    support,
    resistance,
    entrySpots,
    atr: a === null ? null : { value: a, pct: (a / close) * 100 },
    warnings,
  };
}
