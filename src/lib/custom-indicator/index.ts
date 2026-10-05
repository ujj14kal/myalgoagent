import type { Candle } from "@/lib/market-data";
import { evaluateFormula, parseFormula } from "./formula";

// A user's own indicator. Every kind is fully visible (white-box) — the
// definition is the whole indicator, and it travels inside each condition
// that uses it, so a saved strategy, backtest or forward test always
// evaluates exactly what it was built with.
//
//  - formula: an expression over prices and indicators (see formula.ts), drawn
//    on the price chart or as a graph line in its own pane;
//  - signal:  a true/false formula, drawn as markers where it is true (1 / 0);
//  - line:    a trendline drawn through two points; with `offset` it becomes a
//    drawn parallel channel;
//  - level:   a horizontal price level;
//  - zone:    a price band between two levels; with an end time it is a
//    rectangle that only exists between its two edges;
//  - channel: upper and lower lines from formulas (middle optional);
//  - band:    a middle line ± a width, both formulas.
//
// Single-line kinds have one value. Zones, rectangles, channels and bands
// have parts — upper, middle, lower, and "inside" (1 while the close is
// between upper and lower, else 0) — and a rule names the part it reads.

export type LinePoint = { time: number; price: number };
export type CustomPane = "price" | "separate";
/** Optional drawing colour (#rrggbb); charts pick one when it's not set. */
type Look = { color?: string };

export type CustomIndicatorDef =
  | ({ type: "formula"; formula: string; pane: CustomPane } & Look)
  | ({ type: "signal"; formula: string } & Look)
  | ({ type: "line"; points: [LinePoint, LinePoint]; offset?: number; symbol?: string } & Look)
  | ({ type: "level"; price: number; from?: number; symbol?: string } & Look)
  | ({ type: "zone"; upper: number; lower: number; from?: number; to?: number; symbol?: string } & Look)
  | ({ type: "channel"; upper: string; lower: string; middle?: string; pane?: CustomPane } & Look)
  | ({ type: "band"; middle: string; width: string; pane?: CustomPane } & Look);

export type CustomPart = "value" | "upper" | "middle" | "lower" | "inside";
export const BAND_PARTS: CustomPart[] = ["upper", "middle", "lower", "inside"];
export const PART_LABEL: Record<CustomPart, string> = { value: "value", upper: "upper line", middle: "middle line", lower: "lower line", inside: "price inside (1/0)" };

const isMultiPart = (def: CustomIndicatorDef) => def.type === "zone" || def.type === "channel" || def.type === "band" || (def.type === "line" && !!def.offset);

/** The values a rule can read from this indicator. */
export function customParts(def: CustomIndicatorDef): CustomPart[] {
  return isMultiPart(def) ? BAND_PARTS : ["value"];
}

/** What a rule reads when it doesn't name a part. */
export const defaultPart = (def: CustomIndicatorDef): CustomPart => (isMultiPart(def) ? "middle" : "value");

function drawnLine(candles: Candle[], points: [LinePoint, LinePoint]): number[] {
  const [a, b] = points[0].time <= points[1].time ? points : [points[1], points[0]];
  const slope = b.time === a.time ? 0 : (b.price - a.price) / (b.time - a.time);
  return candles.map((c) => (c.time >= b.time ? a.price + slope * (c.time - a.time) : NaN));
}

/** Upper, middle and lower lines of a multi-part indicator (NaN where undefined). */
function bands(candles: Candle[], def: CustomIndicatorDef): { upper: number[]; middle: number[]; lower: number[] } {
  const f = (s: string) => evaluateFormula(parseFormula(s), candles);
  const mid = (u: number[], l: number[]) => u.map((x, i) => (x + l[i]) / 2);
  switch (def.type) {
    case "zone": {
      const on = (t: number) => (def.from === undefined || t >= def.from) && (def.to === undefined || t <= def.to);
      const at = (p: number) => candles.map((c) => (on(c.time) ? p : NaN));
      return { upper: at(def.upper), middle: at((def.upper + def.lower) / 2), lower: at(def.lower) };
    }
    case "channel": {
      const upper = f(def.upper);
      const lower = f(def.lower);
      return { upper, lower, middle: def.middle ? f(def.middle) : mid(upper, lower) };
    }
    case "band": {
      const middle = f(def.middle);
      const width = f(def.width);
      return { upper: middle.map((m, i) => m + width[i]), middle, lower: middle.map((m, i) => m - width[i]) };
    }
    case "line": {
      const main = drawnLine(candles, def.points);
      const other = main.map((v) => v + (def.offset ?? 0));
      const upper = main.map((v, i) => Math.max(v, other[i]));
      const lower = main.map((v, i) => Math.min(v, other[i]));
      return { upper, lower, middle: mid(upper, lower) };
    }
    default:
      throw new Error("This indicator has a single value.");
  }
}

/**
 * Values per candle (NaN where undefined). A drawn line only exists from its
 * later point onwards, a level from the moment it was placed (when it has
 * one), and a rectangle only between its edges — a backtest never reads a
 * drawing before it could have been drawn.
 */
export function computeCustomSeries(candles: Candle[], def: CustomIndicatorDef, part: CustomPart = defaultPart(def)): number[] {
  if (!customParts(def).includes(part)) throw new Error(`This indicator has no ${PART_LABEL[part] ?? part}.`);
  if (isMultiPart(def)) {
    const b = bands(candles, def);
    if (part === "inside") return candles.map((c, i) => (Number.isFinite(b.upper[i]) && Number.isFinite(b.lower[i]) ? (c.close >= b.lower[i] && c.close <= b.upper[i] ? 1 : 0) : NaN));
    return b[part as "upper" | "middle" | "lower"];
  }
  switch (def.type) {
    case "formula":
      return evaluateFormula(parseFormula(def.formula), candles);
    case "signal":
      return evaluateFormula(parseFormula(def.formula), candles).map((v) => (Number.isFinite(v) ? (v !== 0 ? 1 : 0) : NaN));
    case "line":
      return drawnLine(candles, def.points);
    case "level":
      return candles.map((c) => (def.from === undefined || c.time >= def.from ? def.price : NaN));
    default:
      return candles.map(() => NaN);
  }
}

/** Where it draws: formulas, channels and bands choose; drawings, levels, zones and markers sit on the price chart. */
export function customPane(def: CustomIndicatorDef): CustomPane {
  if (def.type === "formula") return def.pane;
  if (def.type === "channel" || def.type === "band") return def.pane ?? "price";
  return "price";
}

export type CustomClass = "Price overlay" | "Graph line" | "Signal markers" | "Trend line" | "Horizontal level" | "Zone" | "Rectangle" | "Channel" | "Band";
export const CUSTOM_CLASSES: CustomClass[] = ["Price overlay", "Graph line", "Signal markers", "Trend line", "Horizontal level", "Zone", "Rectangle", "Channel", "Band"];

/** What each class is and how a rule uses it — shown in the builder and taught to the agent. */
export const CLASS_ABOUT: Record<CustomClass, string> = {
  "Price overlay": "A line drawn on the candles, in price units — compare price to it.",
  "Graph line": "A line in its own pane (a ratio, score or oscillator) — compare it to a number.",
  "Signal markers": "A true/false formula marked on the chart where it is true; reads 1 when true and 0 when not.",
  "Trend line": "A sloped line drawn through two points and extended — compare price to it.",
  "Horizontal level": "One price level — compare price to it.",
  Zone: "A price band between two levels — read its upper, middle or lower line, or ‘inside’ (1 while the close is in the zone).",
  Rectangle: "A zone that only exists between two dates — outside them it has no value, so rules using it can't trigger there.",
  Channel: "Upper and lower lines (drawn parallel, or from formulas) — read either line, the middle, or ‘inside’.",
  Band: "A middle line plus and minus a width — read upper, middle, lower, or ‘inside’.",
};

/** What kind of indicator this is, worked out from its definition (so it can't drift from what it does). */
export function classifyCustom(def: CustomIndicatorDef): CustomClass {
  switch (def.type) {
    case "formula":
      return def.pane === "price" ? "Price overlay" : "Graph line";
    case "signal":
      return "Signal markers";
    case "line":
      if (def.offset) return "Channel";
      return def.points[0].price === def.points[1].price ? "Horizontal level" : "Trend line";
    case "level":
      return "Horizontal level";
    case "zone":
      return def.to !== undefined ? "Rectangle" : "Zone";
    case "channel":
      return "Channel";
    case "band":
      return "Band";
  }
}

const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
const rs = (p: number) => `₹${Math.round(p * 100) / 100}`;

/** A one-line description shown wherever the indicator appears. */
export function describeCustom(def: CustomIndicatorDef): string {
  switch (def.type) {
    case "formula":
      return def.formula;
    case "signal":
      return `marker where ${def.formula}`;
    case "line": {
      const [a, b] = def.points;
      const base = a.price === b.price ? `level at ${rs(a.price)}` : `line from ${rs(a.price)} (${day(a.time)}) to ${rs(b.price)} (${day(b.time)}), extended`;
      return def.offset ? `channel: ${base}, parallel line ${def.offset > 0 ? "+" : "−"}${rs(Math.abs(def.offset))}` : base;
    }
    case "level":
      return `level at ${rs(def.price)}${def.from !== undefined ? ` from ${day(def.from)}` : ""}`;
    case "zone":
      return `zone ${rs(def.lower)}–${rs(def.upper)}${def.from !== undefined && def.to !== undefined ? `, ${day(def.from)} to ${day(def.to)} only` : def.from !== undefined ? ` from ${day(def.from)}` : ""}`;
    case "channel":
      return `channel: upper ${def.upper} · lower ${def.lower}${def.middle ? ` · middle ${def.middle}` : ""}`;
    case "band":
      return `band: ${def.middle} ± ${def.width}`;
  }
}

const COLOR = /^#[0-9a-f]{6}$/i;
const look = (c: unknown) => (typeof c === "string" && COLOR.test(c) ? { color: c.toLowerCase() } : {});
const time = (t: unknown, what: string): number | undefined => {
  if (t === undefined || t === null || t === "") return undefined;
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) throw new Error(`${what} isn't a valid date.`);
  return Math.floor(t);
};
const price = (p: unknown, what: string): number => {
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) throw new Error(`${what} needs a price above 0.`);
  return p;
};
const formula = (s: unknown, what: string): string => {
  if (typeof s !== "string" || !s.trim()) throw new Error(`Missing ${what} formula.`);
  try {
    parseFormula(s);
  } catch (err) {
    throw new Error(`${what[0].toUpperCase()}${what.slice(1)}: ${err instanceof Error ? err.message : "invalid formula"}`);
  }
  return s.trim();
};
const paneOf = (p: unknown): CustomPane | undefined => (p === "price" || p === "separate" ? p : undefined);
const sym = (s: unknown) => (typeof s === "string" && s ? { symbol: s } : {});

/** Throws a plain-English error if the definition can't be used; returns a clean copy. */
export function validateCustomDef(def: unknown): CustomIndicatorDef {
  const d = def as Record<string, unknown> & { type?: string };
  if (!d || typeof d !== "object") throw new Error("Missing indicator definition.");
  switch (d.type) {
    case "formula": {
      if (typeof d.formula !== "string") throw new Error("Missing formula.");
      parseFormula(d.formula);
      const pane = paneOf(d.pane);
      if (!pane) throw new Error("Choose where the indicator is drawn.");
      return { type: "formula", formula: d.formula.trim(), pane, ...look(d.color) };
    }
    case "signal":
      return { type: "signal", formula: formula(d.formula, "signal"), ...look(d.color) };
    case "line": {
      const pts = d.points as LinePoint[] | undefined;
      const ok = Array.isArray(pts) && pts.length === 2 && pts.every((p) => Number.isFinite(p?.time) && Number.isFinite(p?.price) && p.price > 0);
      if (!ok) throw new Error("A line needs two points with prices.");
      const offset = d.offset === undefined || d.offset === 0 ? undefined : Number(d.offset);
      if (offset !== undefined && !Number.isFinite(offset)) throw new Error("The channel width must be a number.");
      return { type: "line", points: [{ time: pts[0].time, price: pts[0].price }, { time: pts[1].time, price: pts[1].price }], ...(offset ? { offset } : {}), ...sym(d.symbol), ...look(d.color) };
    }
    case "level": {
      const from = time(d.from, "The level's start");
      return { type: "level", price: price(d.price, "A level"), ...(from !== undefined ? { from } : {}), ...sym(d.symbol), ...look(d.color) };
    }
    case "zone": {
      const a = price(d.upper, "The zone's upper edge");
      const b = price(d.lower, "The zone's lower edge");
      if (a === b) throw new Error("A zone needs two different prices — use a level for one price.");
      const from = time(d.from, "The zone's start");
      const to = time(d.to, "The zone's end");
      if (to !== undefined && from === undefined) throw new Error("A rectangle needs a start date as well as an end date.");
      if (from !== undefined && to !== undefined && to <= from) throw new Error("A rectangle's end must be after its start.");
      return { type: "zone", upper: Math.max(a, b), lower: Math.min(a, b), ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}), ...sym(d.symbol), ...look(d.color) };
    }
    case "channel": {
      const pane = paneOf(d.pane);
      return {
        type: "channel",
        upper: formula(d.upper, "upper line"),
        lower: formula(d.lower, "lower line"),
        ...(typeof d.middle === "string" && d.middle.trim() ? { middle: formula(d.middle, "middle line") } : {}),
        ...(pane ? { pane } : {}),
        ...look(d.color),
      };
    }
    case "band": {
      const pane = paneOf(d.pane);
      return { type: "band", middle: formula(d.middle, "middle line"), width: formula(d.width, "width"), ...(pane ? { pane } : {}), ...look(d.color) };
    }
  }
  throw new Error("Unknown custom indicator type.");
}

export type CustomVisualLine = { label: string; part: CustomPart; points: { time: number; value: number }[]; dashed?: boolean };
/** How an indicator draws on a chart: its lines (one, or upper/middle/lower) and any markers. */
export type CustomVisual = { pane: CustomPane; lines: CustomVisualLine[]; markers: number[] };

const round = (v: number) => Math.round(v * 10000) / 10000;
const pointsOf = (candles: Candle[], v: number[]) => candles.flatMap((c, i) => (Number.isFinite(v[i]) ? [{ time: c.time, value: round(v[i]) }] : []));

/** Everything a chart needs to draw one custom indicator. Throws if a formula no longer parses. */
export function customVisual(candles: Candle[], def: CustomIndicatorDef, name: string): CustomVisual {
  const pane = customPane(def);
  if (def.type === "signal") {
    const v = computeCustomSeries(candles, def);
    return { pane, lines: [], markers: candles.filter((_, i) => v[i] === 1 && v[i - 1] !== 1).map((c) => c.time) };
  }
  if (isMultiPart(def)) {
    const b = bands(candles, def);
    return {
      pane,
      markers: [],
      lines: [
        { label: `${name} · upper`, part: "upper", points: pointsOf(candles, b.upper) },
        { label: `${name} · middle`, part: "middle", points: pointsOf(candles, b.middle), dashed: true },
        { label: `${name} · lower`, part: "lower", points: pointsOf(candles, b.lower) },
      ],
    };
  }
  return { pane, markers: [], lines: [{ label: name, part: "value", points: pointsOf(candles, computeCustomSeries(candles, def)) }] };
}
