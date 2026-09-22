"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDsl, validateConditionNode, checkConditionFeasibility, collectAuxRequirements } from "@/lib/strategy";
import { NEVER_EXIT_CONDITION, type FeasibilityIssue } from "@/lib/strategy/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validatePositionSizing, toRiskLeg, type PositionSizingMode, type RiskLegInput } from "@/lib/trading-engine/step";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface StrategyInput {
  name: string;
  instrumentId: string;
  mode: "NO_CODE" | "CODE" | "WEBHOOK";
  direction: "LONG" | "SHORT";
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
    direction: input.direction,
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
    const compiled = await compile(input);
    const name = input.name.trim();

    const strategy = await prisma.strategy.create({
      data: {
        userId: session.user.id,
        instrumentId: input.instrumentId,
        name,
        nameNormalized: name.toLowerCase(),
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
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
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
    const compiled = await compile(input);
    const name = input.name.trim();

    await prisma.strategy.updateMany({
      where: { id, userId: session.user.id },
      data: {
        instrumentId: input.instrumentId,
        name,
        nameNormalized: name.toLowerCase(),
        mode: input.mode,
        entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
        entrySource: compiled.entrySource,
        exitSource: compiled.exitSource,
        ...riskFields(input),
      },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  return {};
}

// Draft vs Active is no longer a choice the user makes directly — every
// strategy starts DRAFT, and the only thing that promotes it to ACTIVE is
// actually putting it to work (see activateStrategyIfDraft, called from
// startPaperSession). Backtesting alone does NOT activate a strategy: a
// backtest is exploratory/historical testing, not deploying the strategy,
// so a strategy someone has backtested twenty times and never run is still
// meaningfully a draft. The only manual lifecycle action left is
// archiving/restoring — a deliberate "get this out of my active list"
// choice distinct from the automatic draft->active promotion.
export async function archiveStrategyAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.strategy.updateMany({
    where: { id, userId: session.user.id },
    data: { status: "ARCHIVED" },
  });

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  revalidatePath("/app/dashboard");
}

export async function restoreStrategyAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const hasPaperSession = await prisma.paperSession.findFirst({
    where: { strategyId: id, userId: session.user.id },
    select: { id: true },
  });

  await prisma.strategy.updateMany({
    where: { id, userId: session.user.id },
    data: { status: hasPaperSession ? "ACTIVE" : "DRAFT" },
  });

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  revalidatePath("/app/dashboard");
}

/** Promotes a strategy from DRAFT to ACTIVE the moment it's actually put to
 * work — currently: starting a paper trading session. Never touches a
 * strategy that's already ACTIVE or that's been deliberately ARCHIVED. */
export async function activateStrategyIfDraft(strategyId: string) {
  await prisma.strategy.updateMany({
    where: { id: strategyId, status: "DRAFT" },
    data: { status: "ACTIVE" },
  });
}

/** How many of this strategy's paper sessions are still live (ACTIVE or
 * PAUSED) — used to warn before deleting, since the strategy relation is
 * `onDelete: SetNull` (a session survives its strategy being deleted, it
 * just loses the link back). Without this warning a user could delete a
 * strategy with sessions still actively syncing and never notice — they'd
 * keep running as orphans with no way to find them again from the UI,
 * exactly what this check exists to prevent. */
export async function getLivePaperSessionCount(strategyId: string) {
  const session = await auth();
  if (!session?.user?.id) return 0;

  return prisma.paperSession.count({
    where: { strategyId, userId: session.user.id, status: { in: ["ACTIVE", "PAUSED"] } },
  });
}

/** "Delete" is a soft delete — it moves the strategy to DELETED (its own
 * section, same as Draft/Active/Archived) rather than removing it, with a
 * Restore / Delete forever choice from there. Only
 * permanentlyDeleteStrategyAction ever actually removes the row. */
export async function deleteStrategy(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Move any still-live paper sessions to history (STOPPED) at the same
  // time — enforced unconditionally here, not left to the confirmation
  // dialog, so a session can never keep syncing live against a strategy
  // its owner just deleted, regardless of what the user clicked through.
  // Trade history (orders, P&L) is untouched — STOPPED only takes it out
  // of live syncing, matching the pause/stop it already means for an
  // ordinary session.
  await prisma.$transaction([
    prisma.paperSession.updateMany({
      where: { strategyId: id, userId: session.user.id, status: { in: ["ACTIVE", "PAUSED"] } },
      data: { status: "STOPPED" },
    }),
    prisma.strategy.updateMany({
      where: { id, userId: session.user.id },
      data: { status: "DELETED" },
    }),
  ]);

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/paper-trading");
  redirect("/app/strategies");
}

/** The only action that actually removes a strategy row — restricted to a
 * strategy already sitting in DELETED, so it's never reachable in one
 * click from a live strategy. Paper sessions are swept to STOPPED again
 * defensively (a session could in principle have been reactivated after
 * the soft delete); onDelete: SetNull then just drops their now-pointless
 * link back once the row is actually gone. */
export async function permanentlyDeleteStrategyAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.$transaction([
    prisma.paperSession.updateMany({
      where: { strategyId: id, userId: session.user.id, status: { in: ["ACTIVE", "PAUSED"] } },
      data: { status: "STOPPED" },
    }),
    prisma.strategy.deleteMany({
      where: { id, userId: session.user.id, status: "DELETED" },
    }),
  ]);

  revalidatePath("/app/strategies");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/paper-trading");
}
