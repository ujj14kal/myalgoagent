import type { BooleanSignalKind, ComparisonOperator, ConditionNode, Operand, PriceField } from "./types";
import { INDICATOR_BY_KIND } from "./indicator-catalog";
import { CANDLE_PATTERN_BY_KIND } from "./candle-pattern-catalog";
import { CHART_PATTERN_BY_KIND } from "./chart-pattern-catalog";
import { VOLUME_PATTERN_BY_KIND } from "./volume-pattern-catalog";
import { VALID_INTERVALS } from "@/lib/market-data";

const PRICE_FIELDS: PriceField[] = ["OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"];
const OPERATORS: ComparisonOperator[] = ["GT", "LT", "GTE", "LTE", "EQ", "CROSSES_ABOVE", "CROSSES_BELOW"];
const MINUTES_PER_DAY = 24 * 60;

function validateSignal(v: unknown, path: string): asserts v is BooleanSignalKind {
  if (!isPlainObject(v)) throw new Error(`${path}: expected an object`);

  if (v.family === "TIME_WINDOW") {
    const { startMinute, endMinute } = v;
    if (
      typeof startMinute !== "number" ||
      typeof endMinute !== "number" ||
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      startMinute < 0 ||
      endMinute < 0 ||
      startMinute >= MINUTES_PER_DAY ||
      endMinute > MINUTES_PER_DAY ||
      startMinute >= endMinute
    ) {
      throw new Error(`${path}: startMinute/endMinute must be a valid same-day time range`);
    }
    return;
  }

  if (v.family === "CANDLE_PATTERN") {
    if (typeof v.pattern !== "string" || !CANDLE_PATTERN_BY_KIND.has(v.pattern as never)) {
      throw new Error(`${path}.pattern: unrecognized candle pattern "${String(v.pattern)}"`);
    }
    return;
  }

  if (v.family === "CHART_PATTERN") {
    if (typeof v.pattern !== "string" || !CHART_PATTERN_BY_KIND.has(v.pattern as never)) {
      throw new Error(`${path}.pattern: unrecognized chart pattern "${String(v.pattern)}"`);
    }
    return;
  }

  if (v.family === "VOLUME_PATTERN") {
    if (typeof v.pattern !== "string" || !VOLUME_PATTERN_BY_KIND.has(v.pattern as never)) {
      throw new Error(`${path}.pattern: unrecognized volume pattern "${String(v.pattern)}"`);
    }
    return;
  }

  throw new Error(`${path}.family: unrecognized signal family "${String((v as { family?: unknown }).family)}"`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateOperand(v: unknown, path: string): asserts v is Operand {
  if (!isPlainObject(v)) throw new Error(`${path}: expected an object`);

  if (v.kind === "constant") {
    if (typeof v.value !== "number" || !Number.isFinite(v.value)) {
      throw new Error(`${path}.value: expected a finite number`);
    }
    return;
  }

  if (v.kind === "price") {
    if (typeof v.field !== "string" || !PRICE_FIELDS.includes(v.field as PriceField)) {
      throw new Error(`${path}.field: expected one of ${PRICE_FIELDS.join(", ")}`);
    }
    validateOverride(v, path);
    return;
  }

  if (v.kind === "indicator") {
    const def = typeof v.type === "string" ? INDICATOR_BY_KIND.get(v.type as never) : undefined;
    if (!def) {
      throw new Error(`${path}.type: unrecognized indicator "${String(v.type)}"`);
    }
    if (!Array.isArray(v.params) || v.params.length !== def.paramLabels.length) {
      throw new Error(`${path}.params: ${def.label} expects ${def.paramLabels.length} value(s) (${def.paramLabels.join(", ") || "none"})`);
    }
    for (const p of v.params) {
      if (typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p > 500) {
        throw new Error(`${path}.params: expected each value to be a finite number between 0 and 500`);
      }
    }
    validateOverride(v, path);
    return;
  }

  throw new Error(`${path}.kind: expected "indicator", "price", or "constant"`);
}

/** Validates the optional cross-timeframe/cross-instrument override shared
 * by the "indicator" and "price" operand kinds. Only the *shape* is
 * checked here — whether `instrumentSymbol` actually names a real
 * instrument needs a database round-trip, so that check lives in
 * strategy-actions.ts's compile() instead. */
function validateOverride(v: Record<string, unknown>, path: string): void {
  if (v.timeframe !== undefined && (typeof v.timeframe !== "string" || !VALID_INTERVALS.includes(v.timeframe as never))) {
    throw new Error(`${path}.timeframe: expected one of ${VALID_INTERVALS.join(", ")}`);
  }
  if (v.instrumentSymbol !== undefined && (typeof v.instrumentSymbol !== "string" || v.instrumentSymbol.trim() === "")) {
    throw new Error(`${path}.instrumentSymbol: expected a non-empty string`);
  }
}

export function validateConditionNode(v: unknown, path = "condition"): asserts v is ConditionNode {
  if (!isPlainObject(v)) throw new Error(`${path}: expected an object`);

  if (v.kind === "group") {
    if (v.op !== "AND" && v.op !== "OR") throw new Error(`${path}.op: expected "AND" or "OR"`);
    if (!Array.isArray(v.children) || v.children.length === 0) {
      throw new Error(`${path}.children: expected a non-empty array`);
    }
    v.children.forEach((c, idx) => validateConditionNode(c, `${path}.children[${idx}]`));
    return;
  }

  if (v.kind === "not") {
    validateConditionNode(v.child, `${path}.child`);
    return;
  }

  if (v.kind === "comparison") {
    if (typeof v.operator !== "string" || !OPERATORS.includes(v.operator as ComparisonOperator)) {
      throw new Error(`${path}.operator: expected one of ${OPERATORS.join(", ")}`);
    }
    validateOperand(v.left, `${path}.left`);
    validateOperand(v.right, `${path}.right`);
    return;
  }

  if (v.kind === "signal") {
    validateSignal(v.signal, `${path}.signal`);
    return;
  }

  throw new Error(`${path}.kind: expected "group", "not", "comparison", or "signal"`);
}
