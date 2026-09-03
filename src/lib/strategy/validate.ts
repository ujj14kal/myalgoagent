import type { ComparisonOperator, ConditionNode, IndicatorKind, Operand, PriceField } from "./types";

const INDICATOR_KINDS: IndicatorKind[] = ["SMA", "EMA", "RSI"];
const PRICE_FIELDS: PriceField[] = ["OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"];
const OPERATORS: ComparisonOperator[] = ["GT", "LT", "GTE", "LTE", "EQ", "CROSSES_ABOVE", "CROSSES_BELOW"];

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
    return;
  }

  if (v.kind === "indicator") {
    if (typeof v.type !== "string" || !INDICATOR_KINDS.includes(v.type as IndicatorKind)) {
      throw new Error(`${path}.type: expected one of ${INDICATOR_KINDS.join(", ")}`);
    }
    if (typeof v.period !== "number" || !Number.isInteger(v.period) || v.period < 1 || v.period > 500) {
      throw new Error(`${path}.period: expected an integer between 1 and 500`);
    }
    return;
  }

  throw new Error(`${path}.kind: expected "indicator", "price", or "constant"`);
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

  throw new Error(`${path}.kind: expected "group", "not", or "comparison"`);
}
