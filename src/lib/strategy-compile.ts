import { prisma } from "@/lib/prisma";
import { parseDsl, validateConditionNode, checkConditionFeasibility, collectAuxRequirements } from "@/lib/strategy";
import { NEVER_EXIT_CONDITION, type FeasibilityIssue } from "@/lib/strategy/types";
import { validatePositionSizing, type RiskLegInput } from "@/lib/trading-engine/step";
import type { ConditionNode } from "@/lib/strategy";
import type { StrategyInput } from "@/lib/strategy-actions";

// Every check a strategy must pass before it's saved — shared by the builder's
// server actions (strategy-actions.ts) and the agent's propose_strategy tool,
// so a strategy the agent prepares is held to exactly the same rules.

/** Cross-instrument operands (added for multi-instrument conditions) name a
 * symbol directly rather than an instrument id, so there's no foreign key
 * to lean on — this is the one check that needs a database round-trip and
 * can't live in the pure, synchronous validateConditionNode. */
async function validateReferencedInstruments(entry: ConditionNode, exit: ConditionNode): Promise<void> {
  const symbols = collectAuxRequirements(entry, exit)
    .map((req) => req.instrumentSymbol)
    .filter((s): s is string => s !== undefined);
  if (symbols.length === 0) return;

  const found = await prisma.instrument.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true } });
  const foundSymbols = new Set(found.map((i) => i.symbol));
  const missing = symbols.filter((s) => !foundSymbols.has(s));
  if (missing.length > 0) {
    throw new Error(`Unknown instrument symbol(s) referenced in conditions: ${[...new Set(missing)].join(", ")}`);
  }
}

/** Rules about the strategy's risk configuration that no condition-tree
 * walk can catch, since they're plain numeric fields on the input, not
 * part of a ConditionNode. */
function checkRiskFeasibility(input: StrategyInput): FeasibilityIssue[] {
  const issues: FeasibilityIssue[] = [];
  const legs: { label: string; leg: RiskLegInput }[] = [
    { label: "Stop loss", leg: input.stopLoss },
    { label: "Target", leg: input.target },
    { label: "Trailing stop loss", leg: input.trailingSl },
  ];
  for (const { label, leg } of legs) {
    if (!leg.enabled) continue;
    if (leg.value <= 0) {
      issues.push({ section: "risk", message: `${label} is turned on but set to ${leg.value} — enter a number greater than 0.` });
    } else if (leg.unit === "PERCENT" && leg.value >= 100 && label !== "Target") {
      // A stop-loss/trailing-stop of 100%+ means "only exit once the
      // position is worth zero" — for a long-only position, price can't go
      // negative, so this can never realistically trigger as a loss limit.
      // Target has no equivalent cap: a 100%+ profit target is completely
      // normal (the position can gain any amount).
      issues.push({
        section: "risk",
        message: `${label} of ${leg.value}% can never trigger — a position can't lose 100% or more. Use a smaller percentage.`,
      });
    }
  }
  if (input.maxPyramidEntries < 1) {
    issues.push({
      section: "positionSizing",
      message: `Max entries per position is set to ${input.maxPyramidEntries} — it needs to be at least 1, or the strategy could never open a position.`,
    });
  }
  return issues;
}

/** `validatePositionSizing` throws a single plain Error (it's shared with
 * other, non-strategy-builder callers); this adapts that into the same
 * collected-issues shape everything else here uses, tagged so the "fix it"
 * link in the popup can jump straight to the position-sizing fields. */
function checkPositionSizingFeasibility(input: StrategyInput): FeasibilityIssue[] {
  try {
    validatePositionSizing({ mode: input.positionSizingMode, value: input.positionSizingValue });
    return [];
  } catch (err) {
    return [{ section: "positionSizing", message: err instanceof Error ? err.message : "Invalid position sizing" }];
  }
}

function throwIfInfeasible(issues: FeasibilityIssue[]): void {
  if (issues.length > 0) throw new Error(JSON.stringify(issues));
}

export async function compile(input: StrategyInput): Promise<{
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  entrySource: string | null;
  exitSource: string | null;
}> {
  if (!input.name.trim()) throw new Error("Strategy name is required");
  if (!input.instrumentId) throw new Error("Instrument is required");
  throwIfInfeasible([...checkPositionSizingFeasibility(input), ...checkRiskFeasibility(input)]);

  if (input.mode === "WEBHOOK") {
    // No condition tree at all — entries/exits come from an external
    // TradingView alert, not from anything evaluated here. These two
    // placeholders are simply unused for this mode (the columns aren't
    // nullable); see NEVER_EXIT_CONDITION's own doc comment.
    return {
      entryCondition: NEVER_EXIT_CONDITION,
      exitCondition: NEVER_EXIT_CONDITION,
      entrySource: null,
      exitSource: null,
    };
  }

  if (input.mode === "CODE") {
    if (!input.entrySource?.trim() || !input.exitSource?.trim()) {
      throw new Error("Entry and exit code are required");
    }
    const entryCondition = parseDsl(input.entrySource);
    const exitCondition = parseDsl(input.exitSource);
    throwIfInfeasible([...checkConditionFeasibility(entryCondition, "entry"), ...checkConditionFeasibility(exitCondition, "exit")]);
    await validateReferencedInstruments(entryCondition, exitCondition);
    return {
      entryCondition,
      exitCondition,
      entrySource: input.entrySource,
      exitSource: input.exitSource,
    };
  }

  if (!input.entryCondition || !input.exitCondition) {
    throw new Error("Entry and exit conditions are required");
  }
  validateConditionNode(input.entryCondition, "entryCondition");
  validateConditionNode(input.exitCondition, "exitCondition");
  throwIfInfeasible([
    ...checkConditionFeasibility(input.entryCondition, "entry"),
    ...checkConditionFeasibility(input.exitCondition, "exit"),
  ]);
  await validateReferencedInstruments(input.entryCondition, input.exitCondition);
  return {
    entryCondition: input.entryCondition,
    exitCondition: input.exitCondition,
    entrySource: null,
    exitSource: null,
  };
}

