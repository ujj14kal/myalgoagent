import { customParts, validateCustomDef, type CustomIndicatorDef, type CustomPart } from "@/lib/custom-indicator";
import type { BooleanSignalKind, ComparisonOperator, ConditionNode, Operand, PriceField } from "./types";
import { INDICATOR_BY_KIND } from "./indicator-catalog";
import { CANDLE_PATTERN_BY_KIND } from "./candle-pattern-catalog";
import { CHART_PATTERN_BY_KIND } from "./chart-pattern-catalog";
import { VOLUME_PATTERN_BY_KIND } from "./volume-pattern-catalog";
import { SMC_KINDS, type SmcKind } from "@/lib/smc";
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
    if (v.atLevel !== undefined && v.atLevel !== "SUPPORT" && v.atLevel !== "RESISTANCE") {
      throw new Error(`${path}.atLevel: must be SUPPORT, RESISTANCE or omitted`);
    }
    if (v.window !== undefined) {
      const w = v.window as { startMinute?: unknown; endMinute?: unknown } | null;
      const ok = (m: unknown) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m < 1440;
      if (!w || !ok(w.startMinute) || !ok(w.endMinute) || (w.endMinute as number) <= (w.startMinute as number)) {
        throw new Error(`${path}.window: needs a start and a later end time`);
      }
    }
    validateTimeframe(v.timeframe, path);
    return;
  }

  if (v.family === "CHART_PATTERN") {
    if (typeof v.pattern !== "string" || !CHART_PATTERN_BY_KIND.has(v.pattern as never)) {
      throw new Error(`${path}.pattern: unrecognized chart pattern "${String(v.pattern)}"`);
    }
    validateTimeframe(v.timeframe, path);
    return;
  }

  if (v.family === "VOLUME_PATTERN") {
    if (typeof v.pattern !== "string" || !VOLUME_PATTERN_BY_KIND.has(v.pattern as never)) {
      throw new Error(`${path}.pattern: unrecognized volume pattern "${String(v.pattern)}"`);
    }
    validateTimeframe(v.timeframe, path);
    return;
  }

  if (v.family === "SMC") {
    const o = v as Record<string, unknown>;
    if (typeof o.pattern !== "string" || !SMC_KINDS.includes(o.pattern as SmcKind)) throw new Error(`${path}.pattern: unrecognized smart-money component "${String(o.pattern)}" (one of ${SMC_KINDS.join(", ")})`);
    if (o.side !== "BULLISH" && o.side !== "BEARISH") throw new Error(`${path}.side: BULLISH or BEARISH`);
    const whole = (key: string, lo: number, hi: number) => {
      if (o[key] === undefined) return;
      if (typeof o[key] !== "number" || !Number.isInteger(o[key]) || (o[key] as number) < lo || (o[key] as number) > hi) throw new Error(`${path}.${key}: a whole number from ${lo} to ${hi}`);
    };
    whole("swing", 1, 20);
    whole("maxAge", 1, 500);
    if (o.minGapPct !== undefined && (typeof o.minGapPct !== "number" || o.minGapPct < 0 || o.minGapPct > 20)) throw new Error(`${path}.minGapPct: a % from 0 to 20`);
    validateTimeframe(o.timeframe, path);
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

  if (v.kind === "custom") {
    if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 60) throw new Error(`${path}.name: a custom indicator needs a name (up to 60 characters)`);
    try {
      validateCustomDef(v.def);
    } catch (err) {
      throw new Error(`${path}.def: ${err instanceof Error ? err.message : "invalid custom indicator"}`);
    }
    const parts = customParts(v.def as CustomIndicatorDef);
    if (v.part !== undefined && !parts.includes(v.part as CustomPart)) {
      throw new Error(`${path}.part: “${v.name}” can be read as ${parts.join(", ")} — not "${String(v.part)}"`);
    }
    validateOverride(v, path);
    return;
  }

  throw new Error(`${path}.kind: expected "indicator", "price", "custom", or "constant"`);
}

function validateTimeframe(timeframe: unknown, path: string): void {
  if (timeframe !== undefined && (typeof timeframe !== "string" || !VALID_INTERVALS.includes(timeframe as never))) {
    throw new Error(`${path}.timeframe: expected one of ${VALID_INTERVALS.join(", ")}`);
  }
}

/** Validates the optional cross-timeframe/cross-instrument override shared
 * by the "indicator" and "price" operand kinds. Only the *shape* is
 * checked here — whether `instrumentSymbol` actually names a real
 * instrument needs a database round-trip, so that check lives in
 * strategy-actions.ts's compile() instead. */
function validateOverride(v: Record<string, unknown>, path: string): void {
  validateTimeframe(v.timeframe, path);
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

  if (v.kind === "recent") {
    if (typeof v.bars !== "number" || !Number.isInteger(v.bars) || v.bars < 1 || v.bars > 500) throw new Error(`${path}.bars: expected a whole number from 1 to 500`);
    if (v.mode !== "ANY" && v.mode !== "ALL") throw new Error(`${path}.mode: expected "ANY" or "ALL"`);
    if (v.excludeCurrent !== undefined && typeof v.excludeCurrent !== "boolean") throw new Error(`${path}.excludeCurrent: expected true or false`);
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

  throw new Error(`${path}.kind: expected "group", "not", "recent", "comparison", or "signal"`);
}
