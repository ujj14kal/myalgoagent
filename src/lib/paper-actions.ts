"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { syncPaperSession } from "@/lib/paper/sync";
import { evaluateRisk } from "@/lib/risk/evaluate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { activateStrategyIfDraft } from "@/lib/strategy-actions";
import type { ConditionNode } from "@/lib/strategy";
import { conditionToText } from "@/lib/strategy/format";
import { explainPaperOrder, type ExplainContext } from "@/lib/paper/explain";
import type { RiskUnit } from "@/lib/trading-engine/step";
import type { Prisma } from "@prisma/client";

export interface StartPaperSessionInput {
  strategyId: string;
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
  alertOnly: boolean;
}

function revalidatePaperPaths(id?: string) {
  revalidatePath("/app/paper-trading");
  if (id) revalidatePath(`/app/paper-trading/${id}`);
  revalidatePath("/app/orders");
  revalidatePath("/app/positions");
  revalidatePath("/app/portfolio");
  revalidatePath("/app/notifications");
  revalidatePath("/app/dashboard");
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

    const candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, "1mo", "1d");
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
        alertOnly: input.alertOnly,
        cash: input.startingCapital,
        lastSyncedTime: latestTime,
      },
    });

    // Actually putting a strategy to work is what promotes it out of
    // Draft — see activateStrategyIfDraft's own comment for why
    // backtesting alone doesn't.
    await activateStrategyIfDraft(strategy.id);
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
    return await syncPaperSessionInner(id, userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

async function syncPaperSessionInner(id: string, userId: string): Promise<PaperActionResult> {
  await enforceRateLimit(`paper-sync:${userId}`, 20, 60_000);

  const paperSession = await prisma.paperSession.findFirst({ where: { id, userId } });
  if (!paperSession) throw new Error("Paper session not found");
  if (paperSession.status !== "ACTIVE") throw new Error("This session is not active");

  const riskSettings = await prisma.riskSettings.findUnique({ where: { userId } });
  const riskContext = {
    killSwitchEnabled: riskSettings?.killSwitchEnabled ?? false,
    maxLossPercent: riskSettings?.maxLossPercent ?? null,
    maxConsecutiveLosses: riskSettings?.maxConsecutiveLosses ?? null,
  };

  // Only these two high-volume, non-critical notification types are ever
  // user-toggleable (Agent Settings) — RISK_EVENT/SESSION_STOPPED below are
  // never gated, so a user can't accidentally silence a real risk alert.
  const notifyPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifyOrderFilled: true, notifySignalAlert: true },
  });

  const recentClosedOrders = await prisma.paperOrder.findMany({
    where: { paperSessionId: id, side: "SELL" },
    orderBy: { time: "desc" },
    take: 20,
  });
  // Real bug, fixed here: cash is never debited/credited at entry (see the
  // comment on this same formula in paper-trading/[id]/page.tsx) — it only
  // reflects realized gains from closed trades. Adding the position's full
  // entry-price notional on top of that un-debited cash double-counted the
  // entry cost as unrealized profit, which fed a systematically inflated
  // equity straight into the kill-switch's max-loss check — meaning a real
  // account-wide loss on an open position could fail to trip it. Equity has
  // to be cash plus the position's *unrealized* gain against its current
  // price, mirroring the detail page's calculation.
  let priorEquity = paperSession.cash;
  if (paperSession.positionEntryPrice !== null && paperSession.positionQuantity !== null) {
    const recentCandles = await marketDataProvider.getHistoricalCandles(paperSession.instrumentSymbol, "5d", "1d");
    const latestClose = recentCandles.at(-1)?.close ?? paperSession.positionEntryPrice;
    const unrealizedGain =
      (paperSession.direction === "SHORT" ? paperSession.positionEntryPrice - latestClose : latestClose - paperSession.positionEntryPrice) *
      paperSession.positionQuantity;
    priorEquity = paperSession.cash + unrealizedGain;
  }

  const preCheck = evaluateRisk(
    {
      startingCapital: paperSession.startingCapital,
      currentEquity: priorEquity,
      recentNetPnls: recentClosedOrders.map((o) => o.netPnl ?? 0),
    },
    riskContext,
  );

  const result = await syncPaperSession(
    {
      instrumentSymbol: paperSession.instrumentSymbol,
      direction: paperSession.direction,
      entryCondition: paperSession.entryCondition as unknown as ConditionNode,
      exitCondition: paperSession.exitCondition as unknown as ConditionNode,
      brokeragePercent: paperSession.brokeragePercent,
      slippagePercent: paperSession.slippagePercent,
      positionSizing: { mode: paperSession.positionSizingMode, value: paperSession.positionSizingValue },
      riskManagement: {
        stopLoss: paperSession.stopLossEnabled
          ? { enabled: true, unit: paperSession.stopLossUnit!, value: paperSession.stopLossValue! }
          : null,
        target: paperSession.targetEnabled
          ? { enabled: true, unit: paperSession.targetUnit!, value: paperSession.targetValue! }
          : null,
        trailingSl: paperSession.trailingSlEnabled
          ? { enabled: true, unit: paperSession.trailingSlUnit!, value: paperSession.trailingSlValue! }
          : null,
      },
      maxPyramidEntries: paperSession.maxPyramidEntries,
      alertOnly: paperSession.alertOnly,
      cash: paperSession.cash,
      positionEntryTime: paperSession.positionEntryTime,
      positionEntryPrice: paperSession.positionEntryPrice,
      positionQuantity: paperSession.positionQuantity,
      positionFavorableExtreme: paperSession.positionFavorableExtreme,
      positionStopLossPrice: paperSession.positionStopLossPrice,
      positionTargetPrice: paperSession.positionTargetPrice,
      positionPyramidCount: paperSession.positionPyramidCount,
      lastSyncedTime: paperSession.lastSyncedTime,
    },
    preCheck.allowNewEntries,
  );

  const postCheck = evaluateRisk(
    {
      startingCapital: paperSession.startingCapital,
      currentEquity: result.equity,
      recentNetPnls: [
        ...result.newOrders.filter((o) => o.side === "SELL").map((o) => o.netPnl ?? 0).reverse(),
        ...recentClosedOrders.map((o) => o.netPnl ?? 0),
      ],
    },
    riskContext,
  );

  // Facts for explaining each fill: the rules as written, and the risk legs.
  const leg = (enabled: boolean, unit: RiskUnit | null, value: number | null) => (enabled && unit && value != null ? { unit, value } : null);
  const explainCtx: ExplainContext = {
    symbol: paperSession.instrumentSymbol,
    strategyName: paperSession.strategyName,
    direction: paperSession.direction,
    entryRule: conditionToText(paperSession.entryCondition as unknown as ConditionNode),
    exitRule: conditionToText(paperSession.exitCondition as unknown as ConditionNode),
    stopLoss: leg(paperSession.stopLossEnabled, paperSession.stopLossUnit, paperSession.stopLossValue),
    target: leg(paperSession.targetEnabled, paperSession.targetUnit, paperSession.targetValue),
    trailingStop: leg(paperSession.trailingSlEnabled, paperSession.trailingSlUnit, paperSession.trailingSlValue),
  };

  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.paperSession.update({
      where: { id },
      data: {
        cash: result.cash,
        positionEntryTime: result.position ? result.position.entryTime : null,
        positionEntryPrice: result.position ? result.position.entryPrice : null,
        positionQuantity: result.position ? result.position.quantity : null,
        positionFavorableExtreme: result.position ? result.position.favorableExtreme : null,
        positionStopLossPrice: result.position ? result.position.stopLossPrice : null,
        positionTargetPrice: result.position ? result.position.targetPrice : null,
        positionPyramidCount: result.position ? result.position.pyramidCount : 1,
        lastSyncedTime: result.lastSyncedTime,
        status: postCheck.breach ? "STOPPED" : undefined,
      },
    }),
    ...result.newOrders.map((o) =>
      prisma.paperOrder.create({
        data: {
          paperSessionId: id,
          side: o.side,
          time: o.time,
          price: o.price,
          quantity: o.quantity,
          fees: o.fees,
          netPnl: o.netPnl,
        },
      }),
    ),
    ...(notifyPrefs?.notifyOrderFilled ?? true
      ? result.newOrders.map((o) =>
          prisma.notification.create({
            data: {
              userId,
              paperSessionId: id,
              type: "ORDER_FILLED",
              message: explainPaperOrder(o, explainCtx),
            },
          }),
        )
      : []),
    ...(notifyPrefs?.notifySignalAlert ?? true
      ? result.signalAlerts.map((a) =>
          prisma.notification.create({
            data: {
              userId,
              paperSessionId: id,
              type: "SIGNAL_ALERT",
              message: `${paperSession.strategyName} (${paperSession.instrumentSymbol}): your ${a.type} rule (${a.type === "entry" ? explainCtx.entryRule : explainCtx.exitRule}) fired at ₹${a.price.toFixed(2)} — alert-only, no order placed.`,
            },
          }),
        )
      : []),
  ];

  if (postCheck.breach) {
    const message = `${paperSession.strategyName} (${paperSession.instrumentSymbol}): ${postCheck.breach.message}`;
    writes.push(
      prisma.riskEvent.create({
        data: { userId, paperSessionId: id, type: postCheck.breach.type, message },
      }),
      prisma.notification.create({
        data: { userId, paperSessionId: id, type: "SESSION_STOPPED", message: `Session stopped — ${message}` },
      }),
    );
  } else if (!preCheck.allowNewEntries && riskContext.killSwitchEnabled && result.suppressedEntrySignal) {
    const message = `${paperSession.strategyName} (${paperSession.instrumentSymbol}): an entry signal fired but was blocked — kill switch is on.`;
    writes.push(
      prisma.riskEvent.create({
        data: { userId, paperSessionId: id, type: "KILL_SWITCH_BLOCKED", message },
      }),
      prisma.notification.create({
        data: { userId, paperSessionId: id, type: "RISK_EVENT", message },
      }),
    );
  }

  if (result.sizeTooSmall) {
    writes.push(
      prisma.notification.create({
        data: {
          userId,
          paperSessionId: id,
          type: "RISK_EVENT",
          message: `${paperSession.strategyName} (${paperSession.instrumentSymbol}): an entry signal fired but the configured position size rounds to 0 shares at the current price — skipped.`,
        },
      }),
    );
  }

  await prisma.$transaction(writes);

  revalidatePaperPaths(id);
  return {};
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
