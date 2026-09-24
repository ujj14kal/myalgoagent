"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toRiskLeg, type PositionSizingMode, type RiskLegInput } from "@/lib/trading-engine/step";
import { compile } from "@/lib/strategy-compile";
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
/** Shared by createStrategy (redirects on success) and
 * autoSaveDraftStrategy (doesn't — see its own comment for why). Every
 * new strategy starts DRAFT by default (the schema default), which is
 * exactly the state an auto-saved in-progress one should be in too. */
async function createStrategyRow(
  input: StrategyInput,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  try {
    await enforceRateLimit(`strategy-write:${userId}`, 30, 60_000);
    const compiled = await compile(input);
    const name = input.name.trim();

    const strategy = await prisma.strategy.create({
      data: {
        userId,
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
    return { id: strategy.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function createStrategy(input: StrategyInput): Promise<StrategyActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const result = await createStrategyRow(input, session.user.id);
  if ("error" in result) return result;

  revalidatePath("/app/strategies");
  redirect(`/app/strategies/${result.id}`);
}

/** Called when a user navigates away from the "New Strategy" form before
 * submitting it — the strategy builder intercepts that navigation, calls
 * this, and only then lets it continue. Deliberately does NOT redirect
 * (unlike createStrategy): the user is on their way somewhere else, and
 * forcing them onto the newly-created draft's own page instead would
 * override the navigation they were already mid-click on, which is the
 * opposite of the point — they should land wherever they were headed,
 * with the draft just waiting for them in Strategies whenever they come
 * back to it. */
export async function autoSaveDraftStrategy(input: StrategyInput): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (!input.name.trim()) return { error: "Nothing to save yet" };

  const result = await createStrategyRow(input, session.user.id);
  if (!("error" in result)) revalidatePath("/app/strategies");
  return result;
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
