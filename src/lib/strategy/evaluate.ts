import type { Candle, CandleInterval } from "@/lib/market-data";
import { computeIndicatorSeries } from "./compute-series";
import { computeTimeWindowSeries } from "./time-window";
import { alignToBase } from "./timeframe-align";
import { computeCandlePatternSeries } from "@/lib/candle-patterns";
import { computeChartPatternSeries } from "@/lib/chart-patterns";
import { computeVolumePatternSeries } from "@/lib/volume-patterns";
import type { BooleanSignalKind, ComparisonOperator, ConditionNode, Operand } from "./types";
import type { Signal } from "./types";

type Series = (number | undefined)[];

/** An operand can pull from a different instrument and/or a different
 * timeframe than the strategy's own base chart. Each distinct
 * (symbol, timeframe) override the strategy actually uses needs its own
 * pre-fetched candle series, supplied by the caller (run.ts/paper/sync.ts)
 * and keyed by `auxKey`. */
export type AuxCandleMap = Map<string, Candle[]>;

export function auxKey(instrumentSymbol: string | undefined, timeframe: CandleInterval | undefined): string {
  return `${instrumentSymbol ?? ""}::${timeframe ?? ""}`;
}

function seriesKey(op: Extract<Operand, { kind: "indicator" }>): string {
  return `${op.type}:${op.params.join(",")}:${auxKey(op.instrumentSymbol, op.timeframe)}`;
}

/** Aligns a raw series computed on an override candle set back onto the
 * base bars: `timeframe` set means the override series is on a different
 * interval, so only fully-closed bars may be carried forward
 * (`alignToBase`); no `timeframe` (same interval, different instrument)
 * means the two series already share bar boundaries, so it's a direct
 * time-value join instead. */
function alignOverrideSeries(
  baseCandles: Candle[],
  overrideCandles: Candle[],
  timeframe: CandleInterval | undefined,
  rawSeries: (number | undefined)[],
): Series {
  if (timeframe !== undefined) {
    return alignToBase(baseCandles, overrideCandles, timeframe, rawSeries);
  }
  const byTime = new Map(overrideCandles.map((c, idx) => [c.time, rawSeries[idx]]));
  return baseCandles.map((c) => byTime.get(c.time));
}

function buildSeries(candles: Candle[], operand: Operand, cache: Map<string, Series>, aux: AuxCandleMap): Series {
  if (operand.kind === "constant") {
    return candles.map(() => operand.value);
  }

  const usesOverride = operand.timeframe !== undefined || operand.instrumentSymbol !== undefined;
  const overrideCandles = usesOverride ? aux.get(auxKey(operand.instrumentSymbol, operand.timeframe)) : undefined;

  if (operand.kind === "price") {
    const field = operand.field.toLowerCase() as "open" | "high" | "low" | "close" | "volume";
    if (!usesOverride) return candles.map((c) => c[field]);
    if (!overrideCandles) return candles.map(() => undefined);
    const rawSeries = overrideCandles.map((c) => c[field]);
    return alignOverrideSeries(candles, overrideCandles, operand.timeframe, rawSeries);
  }

  const key = seriesKey(operand);
  const cached = cache.get(key);
  if (cached) return cached;

  let series: Series;
  if (!usesOverride) {
    const points = computeIndicatorSeries(candles, operand.type, operand.params);
    const byTime = new Map(points.map((p) => [p.time, p.value]));
    series = candles.map((c) => byTime.get(c.time));
  } else if (!overrideCandles) {
    series = candles.map(() => undefined);
  } else {
    const points = computeIndicatorSeries(overrideCandles, operand.type, operand.params);
    const byTime = new Map(points.map((p) => [p.time, p.value]));
    const rawSeries = overrideCandles.map((c) => byTime.get(c.time));
    series = alignOverrideSeries(candles, overrideCandles, operand.timeframe, rawSeries);
  }
  cache.set(key, series);
  return series;
}

function collectOperands(node: ConditionNode, out: Operand[]) {
  if (node.kind === "group") {
    for (const child of node.children) collectOperands(child, out);
  } else if (node.kind === "not") {
    collectOperands(node.child, out);
  } else if (node.kind === "comparison") {
    out.push(node.left, node.right);
  }
}

/** Every distinct (instrumentSymbol, timeframe) override referenced by a
 * condition tree — what a caller needs to pre-fetch before evaluating. */
export function collectAuxRequirements(entry: ConditionNode, exit: ConditionNode): { instrumentSymbol?: string; timeframe?: CandleInterval }[] {
  const operands: Operand[] = [];
  collectOperands(entry, operands);
  collectOperands(exit, operands);

  const seen = new Set<string>();
  const out: { instrumentSymbol?: string; timeframe?: CandleInterval }[] = [];
  for (const op of operands) {
    if (op.kind === "constant") continue;
    if (op.timeframe === undefined && op.instrumentSymbol === undefined) continue;
    const key = auxKey(op.instrumentSymbol, op.timeframe);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ instrumentSymbol: op.instrumentSymbol, timeframe: op.timeframe });
  }
  return out;
}

function signalKey(signal: BooleanSignalKind): string {
  switch (signal.family) {
    case "TIME_WINDOW":
      return `TIME_WINDOW:${signal.startMinute}-${signal.endMinute}`;
    case "CANDLE_PATTERN":
      return `CANDLE_PATTERN:${signal.pattern}`;
    case "CHART_PATTERN":
      return `CHART_PATTERN:${signal.pattern}`;
    case "VOLUME_PATTERN":
      return `VOLUME_PATTERN:${signal.pattern}`;
  }
}

function buildSignalSeries(candles: Candle[], signal: BooleanSignalKind): boolean[] {
  switch (signal.family) {
    case "TIME_WINDOW":
      return computeTimeWindowSeries(candles, signal.startMinute, signal.endMinute);
    case "CANDLE_PATTERN":
      return computeCandlePatternSeries(candles, signal.pattern);
    case "CHART_PATTERN":
      return computeChartPatternSeries(candles, signal.pattern);
    case "VOLUME_PATTERN":
      return computeVolumePatternSeries(candles, signal.pattern);
  }
}

function compare(operator: ComparisonOperator, leftPrev: number | undefined, leftCur: number, rightPrev: number | undefined, rightCur: number): boolean {
  switch (operator) {
    case "GT":
      return leftCur > rightCur;
    case "LT":
      return leftCur < rightCur;
    case "GTE":
      return leftCur >= rightCur;
    case "LTE":
      return leftCur <= rightCur;
    case "EQ":
      return leftCur === rightCur;
    case "CROSSES_ABOVE":
      return leftPrev !== undefined && rightPrev !== undefined && leftPrev <= rightPrev && leftCur > rightCur;
    case "CROSSES_BELOW":
      return leftPrev !== undefined && rightPrev !== undefined && leftPrev >= rightPrev && leftCur < rightCur;
  }
}

function evaluateNode(
  node: ConditionNode,
  i: number,
  seriesOf: (operand: Operand) => Series,
  signalSeriesOf: (signal: BooleanSignalKind) => boolean[],
): boolean | undefined {
  if (node.kind === "group") {
    const results = node.children.map((c) => evaluateNode(c, i, seriesOf, signalSeriesOf));
    if (results.some((r) => r === undefined)) return undefined;
    return node.op === "AND" ? results.every(Boolean) : results.some(Boolean);
  }

  if (node.kind === "not") {
    const inner = evaluateNode(node.child, i, seriesOf, signalSeriesOf);
    return inner === undefined ? undefined : !inner;
  }

  if (node.kind === "signal") {
    return signalSeriesOf(node.signal)[i];
  }

  const left = seriesOf(node.left);
  const right = seriesOf(node.right);
  const leftCur = left[i];
  const rightCur = right[i];
  if (leftCur === undefined || rightCur === undefined) return undefined;
  return compare(node.operator, i > 0 ? left[i - 1] : undefined, leftCur, i > 0 ? right[i - 1] : undefined, rightCur);
}

export function evaluateConditionsPerBar(
  candles: Candle[],
  entryCondition: ConditionNode,
  exitCondition: ConditionNode,
  aux: AuxCandleMap = new Map(),
): { entry: boolean[]; exit: boolean[] } {
  const cache = new Map<string, Series>();
  const seriesCacheByOperand = new Map<Operand, Series>();
  const signalCache = new Map<string, boolean[]>();

  function seriesOf(operand: Operand): Series {
    const existing = seriesCacheByOperand.get(operand);
    if (existing) return existing;
    const series = buildSeries(candles, operand, cache, aux);
    seriesCacheByOperand.set(operand, series);
    return series;
  }

  function signalSeriesOf(signal: BooleanSignalKind): boolean[] {
    const key = signalKey(signal);
    const existing = signalCache.get(key);
    if (existing) return existing;
    const series = buildSignalSeries(candles, signal);
    signalCache.set(key, series);
    return series;
  }

  const entry: boolean[] = [];
  const exit: boolean[] = [];
  let prevEntry = false;
  let prevExit = false;

  for (let i = 0; i < candles.length; i++) {
    const entryNow = evaluateNode(entryCondition, i, seriesOf, signalSeriesOf) ?? false;
    const exitNow = evaluateNode(exitCondition, i, seriesOf, signalSeriesOf) ?? false;

    entry.push(entryNow && !prevEntry);
    exit.push(exitNow && !prevExit);

    prevEntry = entryNow;
    prevExit = exitNow;
  }

  return { entry, exit };
}

export function evaluateStrategy(candles: Candle[], entryCondition: ConditionNode, exitCondition: ConditionNode): Signal[] {
  const { entry, exit } = evaluateConditionsPerBar(candles, entryCondition, exitCondition);
  const signals: Signal[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (entry[i]) signals.push({ time: candles[i].time, type: "entry" });
    if (exit[i]) signals.push({ time: candles[i].time, type: "exit" });
  }

  return signals;
}

export function collectConditionOperands(entry: ConditionNode, exit: ConditionNode): Operand[] {
  const out: Operand[] = [];
  collectOperands(entry, out);
  collectOperands(exit, out);
  return out;
}
