"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDsl, validateConditionNode, checkConditionFeasibility, collectAuxRequirements } from "@/lib/strategy";
import { NEVER_EXIT_CONDITION, type FeasibilityIssue } from "@/lib/strategy/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validatePositionSizing, toRiskLeg, type PositionSizingMode, type RiskLegInput } from "@/lib/trading-engine/step";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface StrategyInput {
  name: string;
  instrumentId: string;
  mode: "NO_CODE" | "CODE" | "WEBHOOK";
  entryCondition?: ConditionNode;
  exitCondition?: ConditionNode;
  entrySource?: string;
  exitSource?: string;
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLoss: RiskLegInput;
  target: RiskLegInput;
  trailingSl: RiskLegInput;
  maxPyramidEntries: number;
  /** Set to true to bypass the duplicate-name warning and save anyway. */
  confirmDuplicateName?: boolean;
}

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

/** Throws the sentinel "DUPLICATE_NAME" error the client watches for, unless
 * the user has already confirmed they want to proceed with a reused name. */
async function checkDuplicateName(userId: string, name: string, excludeId: string | undefined, confirmed: boolean | undefined): Promise<void> {
  if (confirmed) return;
  const existing = await prisma.strategy.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new Error("DUPLICATE_NAME");
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

async function compile(input: StrategyInput): Promise<{
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

function riskFields(input: StrategyInput) {
  const stopLoss = toRiskLeg(input.stopLoss);
  const target = toRiskLeg(input.target);
  const trailingSl = toRiskLeg(input.trailingSl);
  return {
    positionSizingMode: input.positionSizingMode,
    positionSizingValue: input.positionSizingValue,
    stopLossEnabled: stopLoss.enabled,
    stopLossUnit: stopLoss.enabled ? stopLoss.unit : null,
    stopLossValue: stopLoss.enabled ? stopLoss.value : null,
    targetEnabled: target.enabled,
    targetUnit: target.enabled ? target.unit : null,
    targetValue: target.enabled ? target.value : null,
    trailingSlEnabled: trailingSl.enabled,
    trailingSlUnit: trailingSl.enabled ? trailingSl.unit : null,
    trailingSlValue: trailingSl.enabled ? trailingSl.value : null,
    maxPyramidEntries: input.maxPyramidEntries,
  };
}

export interface StrategyActionResult {
  error?: string;
}

/**
 * Next.js redacts any custom Error thrown across a Server Action boundary
 * in production builds — the client only ever sees a generic "Minified
 * React error #441" placeholder, never the real message (confirmed against
 * Next.js's own documented behavior; this is a deliberate security
 * mitigation, not a bug in Next.js itself). That silently broke every
 * validation message this action can produce (DUPLICATE_NAME, the
 * AND-group sanity check, "Instrument is required," etc.) the moment this
 * ran in production, even though it worked fine in dev. The fix: validation
 * failures are returned as plain data (`{ error }`), never thrown — only
 * `redirect()`'s own internal mechanism is allowed to throw, since Next.js
 * handles that one specially regardless of this redaction.
 */
export async function createStrategy(input: StrategyInput): Promise<StrategyActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  let strategyId: string;
  try {
    await enforceRateLimit(`strategy-write:${session.user.id}`, 30, 60_000);
    await checkDuplicateName(session.user.id, input.name.trim(), undefined, input.confirmDuplicateName);
    const compiled = await compile(input);

    const strategy = await prisma.strategy.create({
      data: {
        userId: session.user.id,
        instrumentId: input.instrumentId,
        name: input.name.trim(),
        mode: input.mode,
        entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
        entrySource: compiled.entrySource,
        exitSource: compiled.exitSource,
        ...riskFields(input),
      },
    });
    strategyId = strategy.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  revalidatePath("/app/strategies");
  redirect(`/app/strategies/${strategyId}`);
}

export async function updateStrategy(id: string, input: StrategyInput): Promise<StrategyActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  try {
    await enforceRateLimit(`strategy-write:${session.user.id}`, 30, 60_000);
    await checkDuplicateName(session.user.id, input.name.trim(), id, input.confirmDuplicateName);
    const compiled = await compile(input);

    await prisma.strategy.updateMany({
      where: { id, userId: session.user.id },
      data: {
        instrumentId: input.instrumentId,
        name: input.name.trim(),
        mode: input.mode,
        entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
        entrySource: compiled.entrySource,
        exitSource: compiled.exitSource,
        ...riskFields(input),
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  return {};
}

export async function setStrategyStatus(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.strategy.updateMany({
    where: { id, userId: session.user.id },
    data: { status },
  });

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  revalidatePath("/app/dashboard");
}

export async function deleteStrategy(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.strategy.deleteMany({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/app/strategies");
  revalidatePath("/app/dashboard");
  redirect("/app/strategies");
}
