"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor, type CandleInterval } from "@/lib/market-data";
import { rangeFor } from "@/lib/strategy/session";
import { revalidatePaperPaths, syncPaperSessionFor } from "@/lib/paper/sync-session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { activateStrategyIfDraft } from "@/lib/strategy-status";
import type { Prisma } from "@prisma/client";

export interface StartPaperSessionInput {
  strategyId: string;
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
  alertOnly: boolean;
}


export interface PaperActionResult {
  error?: string;
}

/**
 * Validation failures are returned as plain data (`{ error }`), never
 * thrown — Next.js redacts custom Error messages thrown across a Server
 * Action boundary in production builds, replacing them with a generic,
 * unhelpful placeholder. Only `redirect()`'s own internal throw (on
 * success) is exempt, which is why it stays outside the try block. See
 * strategy-actions.ts for the same fix and fuller explanation.
 */
/** Validates and starts a paper session; shared by the form (which redirects) and the agent (which chains). */
async function startPaperSessionCore(userId: string, input: StartPaperSessionInput): Promise<{ id: string } | { error: string }> {
  try {
    await enforceRateLimit(`paper-start:${userId}`, 10, 60_000);

    if (input.startingCapital <= 0) throw new Error("Starting capital must be positive");
    if (input.brokeragePercent < 0 || input.slippagePercent < 0) {
      throw new Error("Brokerage and slippage must be zero or positive");
    }

    const strategy = await prisma.strategy.findFirst({
      where: { id: input.strategyId, userId: userId },
      include: { instrument: true },
    });
    if (!strategy) throw new Error("Strategy not found");
    // Defense in depth against the dropdown filter — a deleted strategy
    // shouldn't be startable even via a stale/direct request.
    if (strategy.status === "DELETED") throw new Error("This strategy has been deleted");

    // The session starts from the latest candle of the strategy's own timeframe.
    const candles = await marketDataFor(userId, "trading").getHistoricalCandles(
      strategy.instrument.symbol,
      rangeFor(strategy.timeframe, "1mo"),
      strategy.timeframe as CandleInterval,
    );
    if (candles.length === 0) throw new Error("No historical data available for this instrument");
    const latestTime = candles.at(-1)!.time;

    const paperSession = await prisma.paperSession.create({
      data: {
        userId: userId,
        strategyId: strategy.id,
        strategyName: strategy.name,
        instrumentSymbol: strategy.instrument.symbol,
        direction: strategy.direction,
        entryCondition: strategy.entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: strategy.exitCondition as unknown as Prisma.InputJsonValue,
        startingCapital: input.startingCapital,
        brokeragePercent: input.brokeragePercent,
        slippagePercent: input.slippagePercent,
        // Execution/risk config comes straight from the strategy — see
        // runBacktestAction for the same pattern and its rationale.
        positionSizingMode: strategy.positionSizingMode,
        positionSizingValue: strategy.positionSizingValue,
        stopLossEnabled: strategy.stopLossEnabled,
        stopLossUnit: strategy.stopLossUnit,
        stopLossValue: strategy.stopLossValue,
        targetEnabled: strategy.targetEnabled,
        targetUnit: strategy.targetUnit,
        targetValue: strategy.targetValue,
        trailingSlEnabled: strategy.trailingSlEnabled,
        trailingSlUnit: strategy.trailingSlUnit,
        trailingSlValue: strategy.trailingSlValue,
        maxPyramidEntries: strategy.maxPyramidEntries,
        timeframe: strategy.timeframe,
        noEntryAfterMinute: strategy.noEntryAfterMinute,
        squareOffMinute: strategy.squareOffMinute,
        productType: strategy.productType,
        orderType: strategy.orderType,
        limitMode: strategy.limitMode,
        limitValue: strategy.limitValue,
        alertOnly: input.alertOnly,
        cash: input.startingCapital,
        lastSyncedTime: latestTime,
      },
    });

    // Actually putting a strategy to work is what promotes it out of
    // Draft — see activateStrategyIfDraft's own comment for why
    // backtesting alone doesn't.
    await activateStrategyIfDraft(strategy.id, userId);
    return { id: paperSession.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function startPaperSession(input: StartPaperSessionInput): Promise<PaperActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const result = await startPaperSessionCore(session.user.id, input);
  if ("error" in result) return result;

  revalidatePaperPaths();
  revalidatePath("/app/strategies");
  redirect(`/app/paper-trading/${result.id}`);
}

/** Same as startPaperSession but returns the new session's id instead of redirecting — for the agent's multi-step plans. */
export async function startPaperSessionForAgent(input: StartPaperSessionInput): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  const result = await startPaperSessionCore(session.user.id, input);
  if ("id" in result) {
    revalidatePaperPaths();
    revalidatePath("/app/strategies");
  }
  return result;
}

export async function syncPaperSessionAction(id: string): Promise<PaperActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  const userId = session.user.id;

  try {
    return await syncPaperSessionFor(id, userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}


/** Called from the Dashboard health panel's "Stop N redundant sessions"
 * action, after the user confirms — stops every live session on this
 * strategy except the one they chose to keep (the panel defaults that
 * choice to whichever was started most recently). Scoped to `userId` and
 * `strategyId` together so it can only ever touch the exact group of
 * sessions the alert was actually about. */
export async function stopDuplicateSessionsAction(strategyId: string, keepSessionId: string): Promise<PaperActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  await prisma.paperSession.updateMany({
    where: {
      strategyId,
      userId: session.user.id,
      id: { not: keepSessionId },
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    data: { status: "STOPPED" },
  });

  revalidatePaperPaths();
  return {};
}

export async function setPaperSessionStatus(id: string, status: "ACTIVE" | "PAUSED" | "STOPPED"): Promise<PaperActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  await prisma.paperSession.updateMany({
    where: { id, userId: session.user.id },
    data: { status },
  });

  revalidatePaperPaths(id);
  return {};
}
