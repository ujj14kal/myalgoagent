import { computeCustomSeries, customPane } from "@/lib/custom-indicator";
import type { Candle } from "@/lib/market-data";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { computeCandlePatternSeries, type CandlePatternKind } from "@/lib/candle-patterns";
import { computeChartPatternSeries, findSwingPoints, type ChartPatternKind, type SwingPoint } from "@/lib/chart-patterns";
import { computeVolumePatternSeries, type VolumePatternKind } from "@/lib/volume-patterns";
import { OSCILLATOR_KINDS, OSCILLATOR_SCALE_GROUP, INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import { isNeverExitCondition, type BooleanSignalKind, type ConditionNode, type IndicatorKind, type Operand } from "@/lib/strategy/types";
import { conditionTruthPerBar, type AuxCandleMap } from "@/lib/strategy/evaluate";
import { resolveRiskDistance, resolveRiskLevels, type RiskManagementConfig, type StrategyDirection } from "@/lib/trading-engine/step";

// Everything the animated strategy replay draws besides the candles: the
// indicator lines, oscillator panes, volume, pattern and time-window markers
// the rules use, and for each trade the exact stop-loss / target / trailing
// stop levels the engine used on every candle. Levels are recomputed with the
// engine's own functions, so the picture matches what the backtest did.

type Values = (number | null)[];

/** A pattern's own geometry, drawn on the pane it belongs to. `pane` is "price", "volume" or an oscillator key. */
export type ReplayShape = {
  lines: { pane: string; pts: [number, number][]; style: "shape" | "neck" | "level" }[];
  points: { pane: string; idx: number; value: number; label: string }[];
};

export type ReplayStudies = {
  /** Lines on the price chart (moving averages, bands, support/resistance…). */
  overlays: { label: string; values: Values; /** Part of the entry rule (gets the signal dot). */ entry: boolean }[];
  /** Fixed prices the rules compare against ("close > 2500"). */
  priceLevels: { label: string; value: number }[];
  /** Oscillators on their own pane, with the thresholds the rules use. */
  oscillators: { key: string; lines: { label: string; values: Values; entry: boolean }[]; levels: number[] }[];
  /** Volume pane: shown when a rule looks at volume. */
  volume: { show: boolean; lines: { label: string; values: Values }[] };
  /** Candles where a pattern in the rules was detected. */
  markers: {
    label: string;
    family: "CANDLE_PATTERN" | "CHART_PATTERN" | "VOLUME_PATTERN";
    pattern: string;
    bars: number[];
    /** How many candles form the pattern, ending at the detected bar (candle patterns). */
    span: number;
    /** Per detected bar: the pattern's swing points and lines (chart patterns, breakouts, divergences). */
    shapes: Record<number, ReplayShape>;
    entry: boolean;
  }[];
  /** Entry/exit time windows (intraday). */
  timeWindows: { label: string; startMinute: number; endMinute: number }[];
  /** Parts of the rules that read other charts and so aren't drawn here. */
  notes: string[];
};

export type ReplayCheck = { text: string; ok: boolean; /** The actual values on that candle, e.g. "RSI(14) 31.4 vs 30". */ detail?: string };

export type TradeReplay = {
  /** Candle where the entry rule was true (the order goes in at the next candle). */
  signalIdx: number;
  entryIdx: number;
  exitIdx: number;
  stopLoss: number | null;
  target: number | null;
  /** Trailing stop on each candle from entryIdx to exitIdx (null when not used). */
  trailing: Values | null;
  /** Each part of the entry rule on the signal candle. */
  checks: ReplayCheck[];
};

export type ReplayRisk = {
  stopLoss: { unit: string; value: number } | null;
  target: { unit: string; value: number } | null;
  trailing: { unit: string; value: number } | null;
};

const round = (v: number) => Math.round(v * 100) / 100;
const LABEL = new Map(INDICATOR_CATALOG.map((d) => [d.kind, d.label]));

const isBase = (o: { timeframe?: unknown; instrumentSymbol?: unknown }) => !o.timeframe && !o.instrumentSymbol;

function alignedSeries(candles: Candle[], type: IndicatorKind, params: number[]): Values {
  const byTime = new Map(computeIndicatorSeries(candles, type, params).map((p) => [p.time, p.value]));
  return candles.map((c) => {
    const v = byTime.get(c.time);
    return v === undefined || !Number.isFinite(v) ? null : round(v);
  });
}

type IndicatorOperand = Extract<Operand, { kind: "indicator" } | { kind: "custom" }>;

const indicatorLabel = (o: IndicatorOperand) => (o.kind === "custom" ? o.name : `${LABEL.get(o.type) ?? o.type}${o.params.length ? `(${o.params.join(", ")})` : ""}`);

/** Values of a built-in or custom indicator on each candle. */
function operandValues(candles: Candle[], o: IndicatorOperand): Values {
  if (o.kind === "indicator") return alignedSeries(candles, o.type, o.params);
  try {
    return computeCustomSeries(candles, o.def).map((v) => (Number.isFinite(v) ? round(v) : null));
  } catch {
    return candles.map(() => null);
  }
}

/** What to draw for the rules, from both the entry and the exit condition. */
export function buildReplayStudies(
  candles: Candle[],
  entry: ConditionNode,
  exit: ConditionNode,
  readable: (node: ConditionNode) => string,
): ReplayStudies {
  const studies: ReplayStudies = { overlays: [], priceLevels: [], oscillators: [], volume: { show: false, lines: [] }, markers: [], timeWindows: [], notes: [] };
  const seen = new Set<string>();
  const oscByKey = new Map<string, ReplayStudies["oscillators"][number]>();

  let inEntry = true;
  const addIndicator = (o: IndicatorOperand): string | null => {
    const label = indicatorLabel(o);
    if (!isBase(o)) {
      const where = [o.instrumentSymbol?.replace(/\.NS$/, ""), o.timeframe].filter(Boolean).join(" ");
      const note = `${label} on the ${where} chart is checked but not drawn here.`;
      if (!studies.notes.includes(note)) studies.notes.push(note);
      return null;
    }
    const key = o.kind === "custom" ? `CUSTOM:${o.name}` : `${o.type}:${o.params.join(",")}`;
    const values = operandValues(candles, o);
    const ownPane = o.kind === "custom" ? customPane(o.def) === "separate" : OSCILLATOR_KINDS.has(o.type);
    if (ownPane) {
      const paneKey = o.kind === "custom" ? key : (OSCILLATOR_SCALE_GROUP[o.type] ?? o.type);
      let pane = oscByKey.get(paneKey);
      if (!pane) {
        pane = { key: paneKey, lines: [], levels: [] };
        oscByKey.set(paneKey, pane);
        studies.oscillators.push(pane);
      }
      if (!seen.has(key)) pane.lines.push({ label, values, entry: inEntry });
      seen.add(key);
      return paneKey;
    }
    if (!seen.has(key)) studies.overlays.push({ label, values, entry: inEntry });
    seen.add(key);
    return "price";
  };

  const walk = (node: ConditionNode) => {
    if (node.kind === "group") return node.children.forEach(walk);
    if (node.kind === "not" || node.kind === "recent") return walk(node.child);
    if (node.kind === "comparison") {
      if (isNeverExitCondition(node)) return;
      const sides = [node.left, node.right];
      let pane: string | null = null;
      for (const s of sides) {
        if (s.kind === "indicator" || s.kind === "custom") pane = addIndicator(s) ?? pane;
        else if (s.kind === "price") {
          if (!isBase(s)) {
            const note = `${s.field.toLowerCase()} of ${[s.instrumentSymbol?.replace(/\.NS$/, ""), s.timeframe].filter(Boolean).join(" ")} is checked but not drawn here.`;
            if (!studies.notes.includes(note)) studies.notes.push(note);
          } else if (s.field === "VOLUME") {
            studies.volume.show = true;
            pane = "volume";
          } else pane = pane ?? "price";
        }
      }
      for (const s of sides) {
        if (s.kind !== "constant") continue;
        if (pane === "price" && !studies.priceLevels.some((l) => l.value === s.value)) studies.priceLevels.push({ label: `₹${s.value}`, value: s.value });
        const osc = pane ? oscByKey.get(pane) : undefined;
        if (osc && !osc.levels.includes(s.value)) osc.levels.push(s.value);
      }
      return;
    }
    addSignal(node.signal);
  };

  const addSignal = (sig: BooleanSignalKind) => {
    if (sig.family === "TIME_WINDOW") {
      if (!studies.timeWindows.some((w) => w.startMinute === sig.startMinute && w.endMinute === sig.endMinute)) {
        studies.timeWindows.push({ label: readable({ kind: "signal", signal: sig }), startMinute: sig.startMinute, endMinute: sig.endMinute });
      }
      return;
    }
    const label = readable({ kind: "signal", signal: { ...sig, ...(sig.family === "CANDLE_PATTERN" ? { atLevel: undefined, window: undefined } : {}) } as BooleanSignalKind });
    if (sig.timeframe) {
      const note = `${label} on the ${sig.timeframe} chart is checked but not marked here.`;
      if (!studies.notes.includes(note)) studies.notes.push(note);
      return;
    }
    const existing = studies.markers.find((m) => m.label === label);
    if (existing) {
      existing.entry ||= inEntry;
      return;
    }
    const series =
      sig.family === "CANDLE_PATTERN"
        ? computeCandlePatternSeries(candles, sig.pattern)
        : sig.family === "CHART_PATTERN"
          ? computeChartPatternSeries(candles, sig.pattern)
          : computeVolumePatternSeries(candles, sig.pattern);
    const bars = series.flatMap((hit, i) => (hit ? [i] : []));
    const shapes: Record<number, ReplayShape> = {};
    if (sig.family === "CHART_PATTERN") {
      const swings = findSwingPoints(candles);
      for (const b of bars) shapes[b] = chartPatternShape(candles, swings, b, sig.pattern);
    } else if (sig.family === "VOLUME_PATTERN") {
      for (const b of bars) shapes[b] = volumePatternShape(candles, b, sig.pattern);
      if (sig.pattern.startsWith("OBV_") && !seen.has("OBV:")) addIndicator({ kind: "indicator", type: "OBV", params: [] });
    }
    studies.markers.push({
      label,
      family: sig.family,
      pattern: sig.pattern,
      bars,
      span: sig.family === "CANDLE_PATTERN" ? CANDLE_SPAN[sig.pattern] : 1,
      shapes,
      entry: inEntry,
    });
    if (sig.family === "VOLUME_PATTERN") studies.volume.show = true;
  };

  walk(entry);
  inEntry = false;
  walk(exit);
  if (studies.volume.show) studies.volume.lines.push({ label: "Avg volume (20)", values: candles.map((_, i) => avgVolume(candles, i, 20)) });
  return studies;
}

function avgVolume(candles: Candle[], i: number, n: number): number | null {
  if (i < n - 1) return null;
  let sum = 0;
  for (let k = i - n + 1; k <= i; k++) sum += candles[k].volume;
  return Math.round(sum / n);
}

/** Each part of the entry rule on every candle, so the replay can tick them off at the signal. */
export function entryCheckers(candles: Candle[], entry: ConditionNode, aux: AuxCandleMap, readable: (node: ConditionNode) => string): (barIdx: number) => ReplayCheck[] {
  const parts = entry.kind === "group" && entry.children.length > 1 ? entry.children : [entry];
  const series = parts.map((p) => ({ text: readable(p), hits: conditionTruthPerBar(candles, p, aux), detail: detailFor(candles, p) }));
  return (i) => series.map((s) => ({ text: s.text, ok: !!s.hits[i], ...(s.detail ? { detail: s.detail(i) } : {}) }));
}

/** Stop-loss, target and the trailing stop per candle, exactly as the engine computes them. */
export function tradeLevels(
  candles: Candle[],
  entryIdx: number,
  exitIdx: number,
  entryPrice: number,
  rm: RiskManagementConfig | undefined,
  direction: StrategyDirection,
  atrAt: (idx: number) => number | undefined,
): Pick<TradeReplay, "stopLoss" | "target" | "trailing"> {
  const atr = atrAt(entryIdx);
  const { stopLossPrice, targetPrice } = resolveRiskLevels(rm, entryPrice, atr, direction);
  let trailing: Values | null = null;
  if (rm?.trailingSl?.enabled) {
    const dist = resolveRiskDistance(rm.trailingSl, entryPrice, atr);
    if (dist !== null) {
      const short = direction === "SHORT";
      let extreme = entryPrice;
      trailing = [];
      for (let i = entryIdx; i <= exitIdx && i < candles.length; i++) {
        extreme = short ? Math.min(extreme, candles[i].low) : Math.max(extreme, candles[i].high);
        trailing.push(round(short ? extreme + dist : extreme - dist));
      }
    }
  }
  return { stopLoss: stopLossPrice !== null ? round(stopLossPrice) : null, target: targetPrice !== null ? round(targetPrice) : null, trailing };
}

// ---------- per-rule detail and pattern geometry ----------

const CANDLE_SPAN: Record<CandlePatternKind, number> = {
  DOJI: 1, HAMMER: 1, INVERTED_HAMMER: 1, SHOOTING_STAR: 1, HANGING_MAN: 1, MARUBOZU_BULLISH: 1, MARUBOZU_BEARISH: 1, SPINNING_TOP: 1,
  BULLISH_ENGULFING: 2, BEARISH_ENGULFING: 2, BULLISH_HARAMI: 2, BEARISH_HARAMI: 2, TWEEZER_TOP: 2, TWEEZER_BOTTOM: 2, PIERCING_LINE: 2, DARK_CLOUD_COVER: 2,
  MORNING_STAR: 3, EVENING_STAR: 3, THREE_WHITE_SOLDIERS: 3, THREE_BLACK_CROWS: 3,
};

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : String(Math.round(v * 100) / 100));
const clockOf = (t: number) => {
  const m = Math.floor(((t + 19_800) % 86_400) / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "EMA(9) 1,512.3 vs EMA(21) 1,508.9" — the numbers behind a comparison on a given candle. */
function detailFor(candles: Candle[], node: ConditionNode): ((i: number) => string) | null {
  if (node.kind === "signal") {
    const sig = node.signal;
    if (sig.family === "TIME_WINDOW") return (i) => `Candle at ${clockOf(candles[i].time)} IST`;
    return sig.timeframe ? null : (i) => whereCaught(candles, i, sig);
  }
  if (node.kind !== "comparison") return null;
  const side = (o: Operand): { label: string; at: (i: number) => number | null } | null => {
    if (o.kind === "constant") return { label: "", at: () => o.value };
    if (!isBase(o)) return null;
    if (o.kind === "price") return { label: o.field.charAt(0) + o.field.slice(1).toLowerCase(), at: (i) => candles[i]?.[o.field.toLowerCase() as "open"] ?? null };
    const values = operandValues(candles, o);
    return { label: indicatorLabel(o), at: (i) => values[i] };
  };
  const l = side(node.left);
  const r = side(node.right);
  if (!l || !r) return null;
  const cross = node.operator === "CROSSES_ABOVE" || node.operator === "CROSSES_BELOW";
  return (i) => {
    const [a, b] = [l.at(i), r.at(i)];
    if (a === null || b === null) return "";
    const now = `${l.label ? `${l.label} ` : ""}${fmt(a)} vs ${r.label ? `${r.label} ` : ""}${fmt(b)}`;
    if (!cross || i === 0) return now;
    const [pa, pb] = [l.at(i - 1), r.at(i - 1)];
    return pa === null || pb === null ? now : `${now} (was ${fmt(pa)} vs ${fmt(pb)})`;
  };
}

const known = (swings: SwingPoint[], i: number) => swings.filter((s) => s.index <= i - 3);
const pt = (s: SwingPoint): [number, number] => [s.index, round(s.price)];
const lineThrough = (a: SwingPoint, b: SwingPoint, toIdx: number): [number, number][] => {
  const slope = b.index === a.index ? 0 : (b.price - a.price) / (b.index - a.index);
  return [pt(a), [toIdx, round(a.price + slope * (toIdx - a.index))]];
};
const closesEvery = (candles: Candle[], from: number, to: number, step = 3): [number, number][] => {
  const out: [number, number][] = [];
  for (let k = Math.max(0, from); k <= to; k += step) out.push([k, round(candles[k].close)]);
  if (out.at(-1)?.[0] !== to) out.push([to, round(candles[to].close)]);
  return out;
};

/** The swing points and lines that make up a chart pattern detected on bar `i`. */
function chartPatternShape(candles: Candle[], swings: SwingPoint[], i: number, pattern: ChartPatternKind): ReplayShape {
  const shape: ReplayShape = { lines: [], points: [] };
  const sw = known(swings, i);
  const close: [number, number] = [i, round(candles[i].close)];
  const tail = (n: number) => sw.slice(-n);
  const zigzag = (pts: SwingPoint[], labels?: string[]) => {
    shape.lines.push({ pane: "price", pts: [...pts.map(pt), close], style: "shape" });
    pts.forEach((s, k) => labels?.[k] && shape.points.push({ pane: "price", idx: s.index, value: round(s.price), label: labels[k] }));
  };
  switch (pattern) {
    case "DOUBLE_TOP":
    case "DOUBLE_BOTTOM": {
      const t = tail(3);
      if (t.length === 3) {
        zigzag(t, pattern === "DOUBLE_TOP" ? ["Top 1", "", "Top 2"] : ["Bottom 1", "", "Bottom 2"]);
        shape.lines.push({ pane: "price", pts: [pt(t[1]), [i, round(t[1].price)]], style: "neck" });
      }
      break;
    }
    case "TRIPLE_TOP":
    case "TRIPLE_BOTTOM":
    case "HEAD_AND_SHOULDERS":
    case "INVERSE_HEAD_AND_SHOULDERS": {
      const t = tail(5);
      if (t.length === 5) {
        const labels = pattern.includes("SHOULDERS") ? ["Left shoulder", "", "Head", "", "Right shoulder"] : pattern === "TRIPLE_TOP" ? ["Top 1", "", "Top 2", "", "Top 3"] : ["Bottom 1", "", "Bottom 2", "", "Bottom 3"];
        zigzag(t, labels);
        shape.lines.push({ pane: "price", pts: lineThrough(t[1], t[3], i), style: "neck" });
      }
      break;
    }
    case "ASCENDING_TRIANGLE":
    case "DESCENDING_TRIANGLE":
    case "SYMMETRICAL_TRIANGLE":
    case "RISING_WEDGE":
    case "FALLING_WEDGE":
    case "RECTANGLE": {
      const t = tail(4);
      const highs = t.filter((s) => s.type === "high");
      const lows = t.filter((s) => s.type === "low");
      zigzag(t);
      if (highs.length === 2) shape.lines.push({ pane: "price", pts: lineThrough(highs[0], highs[1], i), style: "neck" });
      if (lows.length === 2) shape.lines.push({ pane: "price", pts: lineThrough(lows[0], lows[1], i), style: "neck" });
      break;
    }
    case "BULL_FLAG":
    case "BEAR_FLAG":
    case "PENNANT": {
      const consStart = i - 8;
      const poleStart = consStart - 10;
      if (poleStart >= 0) {
        shape.lines.push({ pane: "price", pts: [[poleStart, round(candles[poleStart].close)], [consStart, round(candles[consStart].close)]], style: "shape" });
        shape.points.push({ pane: "price", idx: poleStart, value: round(candles[poleStart].close), label: "Pole" });
        const half = (a: number, b: number, f: (c: Candle) => number, pick: (...v: number[]) => number) => pick(...candles.slice(a, b).map(f));
        const mid = consStart + 4;
        shape.lines.push({ pane: "price", pts: [[consStart, round(half(consStart, mid, (c) => c.high, Math.max))], [i, round(half(mid, i + 1, (c) => c.high, Math.max))]], style: "neck" });
        shape.lines.push({ pane: "price", pts: [[consStart, round(half(consStart, mid, (c) => c.low, Math.min))], [i, round(half(mid, i + 1, (c) => c.low, Math.min))]], style: "neck" });
      }
      break;
    }
    case "CUP_AND_HANDLE": {
      const from = i - 38;
      if (from >= 0) {
        shape.lines.push({ pane: "price", pts: closesEvery(candles, from, i), style: "shape" });
        shape.lines.push({ pane: "price", pts: [[from, round(candles[from].close)], [i, round(candles[from].close)]], style: "neck" });
        shape.points.push({ pane: "price", idx: i - 8, value: round(candles[i - 8].close), label: "Handle" });
      }
      break;
    }
    case "ROUNDING_BOTTOM":
    case "ROUNDING_TOP":
      if (i - 30 >= 0) shape.lines.push({ pane: "price", pts: closesEvery(candles, i - 30, i), style: "shape" });
      break;
  }
  return shape;
}

/** Breakout levels and divergence lines for volume patterns detected on bar `i`. */
function volumePatternShape(candles: Candle[], i: number, pattern: VolumePatternKind): ReplayShape {
  const shape: ReplayShape = { lines: [], points: [] };
  if ((pattern === "BULLISH_VOLUME_BREAKOUT" || pattern === "BEARISH_VOLUME_BREAKDOWN") && i >= 20) {
    const prior = candles.slice(i - 20, i);
    const level = pattern === "BULLISH_VOLUME_BREAKOUT" ? Math.max(...prior.map((c) => c.high)) : Math.min(...prior.map((c) => c.low));
    shape.lines.push({ pane: "price", pts: [[i - 20, round(level)], [i, round(level)]], style: "level" });
    shape.points.push({ pane: "price", idx: i - 20, value: round(level), label: pattern === "BULLISH_VOLUME_BREAKOUT" ? "20-bar high" : "20-bar low" });
  }
  if (pattern === "OBV_BULLISH_DIVERGENCE" || pattern === "OBV_BEARISH_DIVERGENCE") {
    const type = pattern === "OBV_BULLISH_DIVERGENCE" ? "low" : "high";
    const sw = findSwingPoints(candles.slice(0, i + 1), 3, 0.01).filter((s) => s.type === type && s.index <= i - 3).slice(-2);
    if (sw.length === 2) {
      const obvVals = alignedSeries(candles, "OBV", []);
      shape.lines.push({ pane: "price", pts: sw.map(pt), style: "shape" });
      const [a, b] = [obvVals[sw[0].index], obvVals[sw[1].index]];
      if (a !== null && b !== null) shape.lines.push({ pane: "OBV", pts: [[sw[0].index, a], [sw[1].index, b]], style: "shape" });
      shape.points.push({ pane: "price", idx: sw[1].index, value: round(sw[1].price), label: type === "low" ? "Lower low" : "Higher high" });
      if (b !== null) shape.points.push({ pane: "OBV", idx: sw[1].index, value: b, label: type === "low" ? "OBV higher low" : "OBV lower high" });
    }
  }
  return shape;
}

/** When a candle is, in words: "28 Jun" (daily) or "28 Jun 11:15" (intraday). */
function dateOf(candles: Candle[], i: number): string {
  const intraday = candles.length > 1 && candles[1].time - candles[0].time < 86_400;
  const t = candles[i].time;
  const d = new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return intraday ? `${d} ${clockOf(t)}` : d;
}

/** Where and how a pattern in the rules was caught on bar `i` — the checklist's plain-English proof. */
function whereCaught(candles: Candle[], i: number, sig: Exclude<BooleanSignalKind, { family: "TIME_WINDOW" }>): string {
  const inr = (v: number) => `₹${fmt(v)}`;
  if (sig.family === "CANDLE_PATTERN") {
    const span = CANDLE_SPAN[sig.pattern];
    const from = Math.max(0, i - span + 1);
    return span === 1 ? `Caught on the ${dateOf(candles, i)} candle` : `Caught on ${dateOf(candles, from)} – ${dateOf(candles, i)} (${span} candles)`;
  }
  if (sig.family === "CHART_PATTERN") {
    const shape = chartPatternShape(candles, findSwingPoints(candles), i, sig.pattern);
    const points = shape.points.filter((p) => p.label).map((p) => `${p.label} on ${dateOf(candles, p.idx)} at ${inr(p.value)}`);
    const neck = shape.lines.find((l) => l.style === "neck");
    const lineName = /DOUBLE|TRIPLE|SHOULDERS|CUP/.test(sig.pattern) ? "neckline" : "pattern line";
    const lineAt = neck?.pts[neck.pts.length - 1][1];
    const broke = lineAt !== undefined ? ` · closed ${inr(candles[i].close)} ${candles[i].close >= lineAt ? "above" : "below"} the ${lineName} ${inr(lineAt)}` : "";
    return `Completed on ${dateOf(candles, i)}${points.length ? ` — ${points.join(" · ")}` : ""}${broke}`;
  }
  const avg = i >= 20 ? candles.slice(i - 20, i).reduce((a, c) => a + c.volume, 0) / 20 : 0;
  const ratio = avg > 0 ? `${(candles[i].volume / avg).toFixed(1)}× its 20-bar average` : "";
  switch (sig.pattern) {
    case "VOLUME_SPIKE":
    case "VOLUME_DRY_UP":
      return `Caught on ${dateOf(candles, i)} — volume ${ratio}`;
    case "BULLISH_VOLUME_BREAKOUT":
    case "BEARISH_VOLUME_BREAKDOWN": {
      const level = volumePatternShape(candles, i, sig.pattern).lines[0]?.pts[0]?.[1];
      const word = sig.pattern === "BULLISH_VOLUME_BREAKOUT" ? "above the 20-bar high" : "below the 20-bar low";
      return `Caught on ${dateOf(candles, i)} — closed ${inr(candles[i].close)} ${word}${level ? ` ${inr(level)}` : ""} on volume ${ratio}`;
    }
    default: {
      const pts = volumePatternShape(candles, i, sig.pattern).points;
      const price = pts.find((p) => p.pane === "price");
      return `Caught on ${dateOf(candles, i)}${price ? ` — ${price.label.toLowerCase()} ${inr(price.value)} on ${dateOf(candles, price.idx)} while OBV rose` : ""}`.replace("while OBV rose", sig.pattern === "OBV_BULLISH_DIVERGENCE" ? "while OBV made a higher low" : "while OBV made a lower high");
    }
  }
}
