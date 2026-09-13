import type { BooleanSignalKind, ComparisonOperator, ConditionNode, Operand } from "./types";

const FAMILY_LABEL: Record<BooleanSignalKind["family"], string> = {
  TIME_WINDOW: "time window",
  CANDLE_PATTERN: "candle pattern",
  CHART_PATTERN: "chart pattern",
  VOLUME_PATTERN: "volume pattern",
};

// NSE's actual regular continuous-trading session for equity/index
// instruments, verified against current exchange rules: 09:00-09:15 is the
// pre-open call-auction phase (price discovery, not continuous trading a
// live indicator/pattern condition could meaningfully act on), and regular
// trading runs 09:15-15:30. F&O instruments specifically stop continuous
// trading 15 minutes earlier (15:15) ahead of their own closing auction —
// not modeled here since the Instrument schema doesn't currently track
// equity-vs-F&O segment, so this check uses the (correct, slightly
// conservative for F&O) equity session as the baseline.
const MARKET_OPEN_MINUTE = 9 * 60 + 15; // 09:15 IST
const MARKET_CLOSE_MINUTE = 15 * 60 + 30; // 15:30 IST

function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function describeOperand(op: Operand): string {
  if (op.kind === "indicator") return `${op.type}(${op.params.join(",")})`;
  if (op.kind === "price") return op.field;
  return String(op.value);
}

/** A stable identity for an operand's *source series* — two operands with
 * the same identity would always read the same value at the same bar, so
 * comparing one against the other (or reasoning about their combined
 * bounds) is meaningful. Constants have no such identity — there's nothing
 * to "self-compare" a fixed number against. */
function operandIdentity(op: Operand): string | null {
  if (op.kind === "indicator") return `IND:${op.type}:${op.params.join(",")}:${op.timeframe ?? ""}:${op.instrumentSymbol ?? ""}`;
  if (op.kind === "price") return `PRICE:${op.field}:${op.timeframe ?? ""}:${op.instrumentSymbol ?? ""}`;
  return null;
}

const ALWAYS_FALSE_SELF_COMPARE: ComparisonOperator[] = ["GT", "LT", "CROSSES_ABOVE", "CROSSES_BELOW"];

/** An inclusive/exclusive numeric bound implied by comparing a series
 * against a fixed constant — the basis for detecting two ANDed comparisons
 * on the same series that no value could ever simultaneously satisfy. */
interface Bound {
  min?: number;
  minInclusive?: boolean;
  max?: number;
  maxInclusive?: boolean;
}

function boundFromComparison(operator: ComparisonOperator, constant: number): Bound | null {
  switch (operator) {
    case "GT":
      return { min: constant, minInclusive: false };
    case "GTE":
      return { min: constant, minInclusive: true };
    case "LT":
      return { max: constant, maxInclusive: false };
    case "LTE":
      return { max: constant, maxInclusive: true };
    case "EQ":
      return { min: constant, minInclusive: true, max: constant, maxInclusive: true };
    default:
      // CROSSES_ABOVE/CROSSES_BELOW describe a momentary event, not a
      // static range — they don't compose into a bound.
      return null;
  }
}

function boundsAreDisjoint(a: Bound, b: Bound): boolean {
  const min = Math.max(a.min ?? -Infinity, b.min ?? -Infinity);
  const max = Math.min(a.max ?? Infinity, b.max ?? Infinity);
  if (min > max) return true;
  if (min === max) {
    const minInclusive = (a.min !== min || a.minInclusive !== false) && (b.min !== min || b.minInclusive !== false);
    const maxInclusive = (a.max !== max || a.maxInclusive !== false) && (b.max !== max || b.maxInclusive !== false);
    return !(minInclusive && maxInclusive);
  }
  return false;
}

function checkComparisonNode(node: Extract<ConditionNode, { kind: "comparison" }>, path: string, issues: string[]): void {
  const { left, right, operator } = node;

  // Two fixed numbers don't reference any market data at all — the
  // comparison's result never depends on a single bar, so it can't be a
  // real trading condition (it's either permanently true or permanently
  // false the moment the strategy is created).
  if (left.kind === "constant" && right.kind === "constant") {
    issues.push(
      `${path}: comparing two fixed numbers (${left.value} ${operator} ${right.value}) doesn't reference any market data — this isn't a trading condition, it's just a fixed true/false value.`,
    );
    return;
  }

  const leftId = operandIdentity(left);
  const rightId = operandIdentity(right);
  if (leftId !== null && leftId === rightId) {
    const always = ALWAYS_FALSE_SELF_COMPARE.includes(operator) ? "false" : "true";
    issues.push(
      `${path}: comparing "${describeOperand(left)}" to itself is always ${always} — this condition can never distinguish anything, so it's not a usable trigger.`,
    );
    return;
  }

  // (A "crosses above/below" between two constants is already caught by
  // the constant-vs-constant check above — worth noting it's not just
  // "meaningless" there but "can never fire even once," since neither
  // side can move relative to the other.)

  // Comparing two live series for *exact* equality will, in practice,
  // essentially never happen with real market data — two independently
  // computed floating-point values matching to the exact decimal is
  // astronomically unlikely, even though it's not mathematically
  // impossible the way the cases above are.
  if (operator === "EQ" && left.kind !== "constant" && right.kind !== "constant") {
    issues.push(
      `${path}: "${describeOperand(left)} equals ${describeOperand(right)}" compares two independently computed values for exact equality — with real market data this will essentially never be true, even though it's not technically impossible.`,
    );
  }
}

function checkTimeWindowFeasibility(signal: Extract<BooleanSignalKind, { family: "TIME_WINDOW" }>, path: string, issues: string[]): void {
  if (signal.endMinute <= MARKET_OPEN_MINUTE || signal.startMinute >= MARKET_CLOSE_MINUTE) {
    issues.push(
      `${path}: the time window ${minutesToClock(signal.startMinute)}–${minutesToClock(signal.endMinute)} falls entirely outside NSE's trading session (09:15 AM–3:30 PM IST) — this condition could never fire against real market data.`,
    );
  }
}

/** Within one AND group, two comparisons against the *same* series with a
 * constant on the other side can jointly rule out every possible value
 * (e.g. `RSI(14) > 70` AND `RSI(14) < 30`) — no single reading of that
 * series could ever satisfy both at once. */
function checkNumericContradictions(children: ConditionNode[], path: string, issues: string[]): void {
  const boundsBySeries = new Map<string, { label: string; bound: Bound; operator: ComparisonOperator }[]>();

  for (const child of children) {
    if (child.kind !== "comparison") continue;
    const { left, right, operator } = child;
    const seriesOperand = right.kind === "constant" ? left : left.kind === "constant" ? right : null;
    const constantOperand = right.kind === "constant" ? right : left.kind === "constant" ? left : null;
    if (!seriesOperand || !constantOperand || constantOperand.kind !== "constant") continue;

    const seriesId = operandIdentity(seriesOperand);
    if (seriesId === null) continue;
    const bound = boundFromComparison(operator, constantOperand.value);
    if (!bound) continue;

    const existing = boundsBySeries.get(seriesId) ?? [];
    existing.push({ label: describeOperand(seriesOperand), bound, operator });
    boundsBySeries.set(seriesId, existing);
  }

  for (const entries of boundsBySeries.values()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (boundsAreDisjoint(entries[i].bound, entries[j].bound)) {
          issues.push(
            `${path}: no value of "${entries[i].label}" can satisfy both of these at once — they rule each other out entirely.`,
          );
        }
      }
    }
  }
}

/**
 * The full feasibility pass for one condition tree: catches everything
 * structurally impossible to ever fire against real market data, or
 * mathematically self-contradictory, so a broken strategy is caught before
 * it's saved rather than silently doing nothing forever. Returns every
 * issue found (not just the first), so a user can fix them all in one pass.
 */
export function checkConditionFeasibility(node: ConditionNode, path = "condition"): string[] {
  const issues: string[] = [];
  walk(node, path, issues);
  return issues;
}

function walk(node: ConditionNode, path: string, issues: string[]): void {
  if (node.kind === "comparison") {
    checkComparisonNode(node, path, issues);
    return;
  }

  if (node.kind === "signal") {
    if (node.signal.family === "TIME_WINDOW") checkTimeWindowFeasibility(node.signal, path, issues);
    return;
  }

  if (node.kind === "not") {
    walk(node.child, `${path}.child`, issues);
    return;
  }

  // group
  if (node.op === "AND") {
    const seen = new Map<string, string>();
    for (const child of node.children) {
      if (child.kind !== "signal") continue;
      const family = child.signal.family;
      if (seen.has(family)) {
        issues.push(
          `${path}: a strategy can't require two different ${FAMILY_LABEL[family]} conditions to both be true on the same bar — did you mean OR instead of AND?`,
        );
      }
      seen.set(family, family);
    }
    checkNumericContradictions(node.children, path, issues);
  }
  node.children.forEach((c, idx) => walk(c, `${path}.children[${idx}]`, issues));
}
