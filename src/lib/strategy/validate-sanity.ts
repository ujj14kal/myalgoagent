import { isNeverExitCondition, type BooleanSignalKind, type ComparisonOperator, type ConditionNode, type FeasibilityIssue, type FeasibilitySection, type Operand } from "./types";

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

function checkComparisonNode(node: Extract<ConditionNode, { kind: "comparison" }>, section: FeasibilitySection, issues: FeasibilityIssue[]): void {
  const { left, right, operator } = node;

  // Two fixed numbers don't reference any market data at all — the
  // comparison's result never depends on a single bar, so it can't be a
  // real trading condition (it's either permanently true or permanently
  // false the moment the strategy is created).
  if (left.kind === "constant" && right.kind === "constant") {
    issues.push({
      section,
      message: `This condition just compares two plain numbers (${left.value} vs ${right.value}) — it never looks at real market data, so it can't work as a trading rule.`,
    });
    return;
  }

  const leftId = operandIdentity(left);
  const rightId = operandIdentity(right);
  if (leftId !== null && leftId === rightId) {
    const always = ALWAYS_FALSE_SELF_COMPARE.includes(operator) ? "false" : "true";
    issues.push({
      section,
      message: `This compares "${describeOperand(left)}" to itself, so the result is always ${always} — it can never actually decide anything.`,
    });
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
    issues.push({
      section,
      message: `"${describeOperand(left)}" and "${describeOperand(right)}" are unlikely to ever match exactly on real market data, so this will almost never trigger. Try "crosses above/below" instead of "equals."`,
    });
  }
}

function checkTimeWindowFeasibility(signal: Extract<BooleanSignalKind, { family: "TIME_WINDOW" }>, section: FeasibilitySection, issues: FeasibilityIssue[]): void {
  if (signal.endMinute <= MARKET_OPEN_MINUTE || signal.startMinute >= MARKET_CLOSE_MINUTE) {
    issues.push({
      section,
      message: `${minutesToClock(signal.startMinute)}–${minutesToClock(signal.endMinute)} is outside NSE's trading hours (9:15 AM–3:30 PM), so this condition could never fire.`,
    });
  }
}

/** Within one AND group, two comparisons against the *same* series with a
 * constant on the other side can jointly rule out every possible value
 * (e.g. `RSI(14) > 70` AND `RSI(14) < 30`) — no single reading of that
 * series could ever satisfy both at once. */
function checkNumericContradictions(children: ConditionNode[], section: FeasibilitySection, issues: FeasibilityIssue[]): void {
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
          issues.push({
            section,
            message: `These two conditions on "${entries[i].label}" can never both be true at once — one already rules out the other.`,
          });
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
 *
 * `section` tags every issue found so the UI can link straight back to the
 * entry/exit card that needs fixing, rather than making the user hunt for
 * it. `NEVER_EXIT_CONDITION` — the deliberate "no condition-based exit
 * configured" placeholder — is exempted entirely: it's a real, intentional
 * always-false condition by design, not a mistake the user made.
 */
export function checkConditionFeasibility(node: ConditionNode, section: FeasibilitySection): FeasibilityIssue[] {
  if (isNeverExitCondition(node)) return [];
  const issues: FeasibilityIssue[] = [];
  walk(node, section, issues);
  return issues;
}

function walk(node: ConditionNode, section: FeasibilitySection, issues: FeasibilityIssue[]): void {
  if (node.kind === "comparison") {
    checkComparisonNode(node, section, issues);
    return;
  }

  if (node.kind === "signal") {
    if (node.signal.family === "TIME_WINDOW") checkTimeWindowFeasibility(node.signal, section, issues);
    return;
  }

  if (node.kind === "not") {
    walk(node.child, section, issues);
    return;
  }

  // group
  if (node.op === "AND") {
    const seen = new Map<string, string>();
    for (const child of node.children) {
      if (child.kind !== "signal") continue;
      const family = child.signal.family;
      if (seen.has(family)) {
        issues.push({
          section,
          message: `You've combined two ${FAMILY_LABEL[family]} conditions with AND, but only one can be true on a given bar — did you mean OR?`,
        });
      }
      seen.set(family, family);
    }
    checkNumericContradictions(node.children, section, issues);
  }
  node.children.forEach((c) => walk(c, section, issues));
}
