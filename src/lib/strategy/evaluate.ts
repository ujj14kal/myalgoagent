import type { Candle } from "@/lib/market-data";
import { sma, ema, rsi } from "@/lib/indicators";
import type { ComparisonOperator, ConditionNode, Operand } from "./types";
import type { Signal } from "./types";

type Series = (number | undefined)[];

function seriesKey(op: Extract<Operand, { kind: "indicator" }>): string {
  return `${op.type}:${op.period}`;
}

function buildSeries(candles: Candle[], operand: Operand, cache: Map<string, Series>): Series {
  if (operand.kind === "constant") {
    return candles.map(() => operand.value);
  }

  if (operand.kind === "price") {
    const field = operand.field.toLowerCase() as "open" | "high" | "low" | "close" | "volume";
    return candles.map((c) => c[field]);
  }

  const key = seriesKey(operand);
  const cached = cache.get(key);
  if (cached) return cached;

  const points = operand.type === "SMA" ? sma(candles, operand.period) : operand.type === "EMA" ? ema(candles, operand.period) : rsi(candles, operand.period);
  const byTime = new Map(points.map((p) => [p.time, p.value]));
  const series: Series = candles.map((c) => byTime.get(c.time));
  cache.set(key, series);
  return series;
}

function collectOperands(node: ConditionNode, out: Operand[]) {
  if (node.kind === "group") {
    for (const child of node.children) collectOperands(child, out);
  } else if (node.kind === "not") {
    collectOperands(node.child, out);
  } else {
    out.push(node.left, node.right);
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
): boolean | undefined {
  if (node.kind === "group") {
    const results = node.children.map((c) => evaluateNode(c, i, seriesOf));
    if (results.some((r) => r === undefined)) return undefined;
    return node.op === "AND" ? results.every(Boolean) : results.some(Boolean);
  }

  if (node.kind === "not") {
    const inner = evaluateNode(node.child, i, seriesOf);
    return inner === undefined ? undefined : !inner;
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
): { entry: boolean[]; exit: boolean[] } {
  const cache = new Map<string, Series>();
  const seriesCacheByOperand = new Map<Operand, Series>();

  function seriesOf(operand: Operand): Series {
    const existing = seriesCacheByOperand.get(operand);
    if (existing) return existing;
    const series = buildSeries(candles, operand, cache);
    seriesCacheByOperand.set(operand, series);
    return series;
  }

  const entry: boolean[] = [];
  const exit: boolean[] = [];
  let prevEntry = false;
  let prevExit = false;

  for (let i = 0; i < candles.length; i++) {
    const entryNow = evaluateNode(entryCondition, i, seriesOf) ?? false;
    const exitNow = evaluateNode(exitCondition, i, seriesOf) ?? false;

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
