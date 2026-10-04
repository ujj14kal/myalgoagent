import type { Candle } from "@/lib/market-data";
import { evaluateFormula, parseFormula } from "./formula";

// A user's own indicator. Two kinds, both fully visible (white-box):
//  - formula: an expression over prices and indicators (see formula.ts);
//  - line: a trendline or level drawn on the chart through two points.
// The definition travels inside each condition that uses it, so a saved
// strategy, backtest or forward test always evaluates exactly what it was built with.

export type LinePoint = { time: number; price: number };
export type CustomIndicatorDef =
  | { type: "formula"; formula: string; pane: "price" | "separate" }
  | { type: "line"; points: [LinePoint, LinePoint]; symbol?: string };

/**
 * Values per candle (NaN where undefined). A drawn line only exists from its
 * later point onwards — before that it would use prices the chart hadn't
 * shown yet, which is look-ahead in a backtest.
 */
export function computeCustomSeries(candles: Candle[], def: CustomIndicatorDef): number[] {
  if (def.type === "formula") return evaluateFormula(parseFormula(def.formula), candles);
  const [a, b] = def.points[0].time <= def.points[1].time ? def.points : [def.points[1], def.points[0]];
  const slope = b.time === a.time ? 0 : (b.price - a.price) / (b.time - a.time);
  return candles.map((c) => (c.time >= b.time ? a.price + slope * (c.time - a.time) : NaN));
}

/** Where it draws: formulas choose; lines are always on the price chart. */
export const customPane = (def: CustomIndicatorDef): "price" | "separate" => (def.type === "formula" ? def.pane : "price");

export type CustomClass = "Overlay on price" | "Own-pane indicator" | "Trendline" | "Horizontal level";
export const CUSTOM_CLASSES: CustomClass[] = ["Overlay on price", "Own-pane indicator", "Trendline", "Horizontal level"];

/** What kind of indicator this is, worked out from its definition (so it can't drift from what it does). */
export function classifyCustom(def: CustomIndicatorDef): CustomClass {
  if (def.type === "formula") return def.pane === "price" ? "Overlay on price" : "Own-pane indicator";
  return def.points[0].price === def.points[1].price ? "Horizontal level" : "Trendline";
}

/** A one-line description shown wherever the indicator appears. */
export function describeCustom(def: CustomIndicatorDef): string {
  if (def.type === "formula") return def.formula;
  const [a, b] = def.points;
  const d = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
  return a.price === b.price ? `level at ₹${a.price}` : `line from ₹${a.price} (${d(a.time)}) to ₹${b.price} (${d(b.time)}), extended`;
}

/** Throws a plain-English error if the definition can't be used. */
export function validateCustomDef(def: unknown): CustomIndicatorDef {
  const d = def as CustomIndicatorDef;
  if (!d || typeof d !== "object") throw new Error("Missing indicator definition.");
  if (d.type === "formula") {
    if (typeof d.formula !== "string") throw new Error("Missing formula.");
    parseFormula(d.formula);
    if (d.pane !== "price" && d.pane !== "separate") throw new Error("Choose where the indicator is drawn.");
    return { type: "formula", formula: d.formula.trim(), pane: d.pane };
  }
  if (d.type === "line") {
    const ok = Array.isArray(d.points) && d.points.length === 2 && d.points.every((p) => Number.isFinite(p?.time) && Number.isFinite(p?.price) && p.price > 0);
    if (!ok) throw new Error("A line needs two points with prices.");
    return { type: "line", points: [{ time: d.points[0].time, price: d.points[0].price }, { time: d.points[1].time, price: d.points[1].price }], ...(d.symbol ? { symbol: String(d.symbol) } : {}) };
  }
  throw new Error("Unknown custom indicator type.");
}
