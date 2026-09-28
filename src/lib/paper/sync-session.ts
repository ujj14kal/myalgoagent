import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { marketDataFor, isIntraday, type CandleInterval } from "@/lib/market-data";
import { syncPaperSession } from "@/lib/paper/sync";
import { evaluateRisk } from "@/lib/risk/evaluate";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ConditionNode } from "@/lib/strategy";
import { conditionToText } from "@/lib/strategy/format";
import { explainPaperOrder, type ExplainContext } from "@/lib/paper/explain";
import type { RiskUnit } from "@/lib/trading-engine/step";
import type { Prisma } from "@prisma/client";

// Not a Server Action module: the scheduled job (an internal API route) and
// the Sync button's action both call in here.

type Tx = Prisma.TransactionClient;

class SyncConflict extends Error {}

export function revalidatePaperPaths(id?: string) {
  revalidatePath("/app/paper-trading");
  if (id) revalidatePath(`/app/paper-trading/${id}`);
  revalidatePath("/app/orders");
  revalidatePath("/app/positions");
  revalidatePath("/app/portfolio");
  revalidatePath("/app/notifications");
  revalidatePath("/app/dashboard");
}

/**
 * Brings one ACTIVE paper session up to date with the latest *closed* candles:
 * fills entries/exits (stop-loss, target, trailing stop, exit rule), applies
 * risk limits and records notifications. Shared by the Sync button and the
 * scheduled job, so an open trade closes on its own when a stop is hit.
 */
export async function syncPaperSessionFor(id: string, userId: string, opts: { scheduled?: boolean } = {}): Promise<{ error?: string }> {
  // The per-user limit guards the Sync button; the scheduled job runs once per session per interval.
  if (!opts.scheduled) await enforceRateLimit(`paper-sync:${userId}`, 20, 60_000);

  const paperSession = await prisma.paperSession.findFirst({ where: { id, userId } });
  const market = marketDataFor(userId, "trading");
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
    const recentCandles = await market.getHistoricalCandles(paperSession.instrumentSymbol, "5d", "1d");
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
      timeframe: paperSession.timeframe,
      noEntryAfterMinute: paperSession.noEntryAfterMinute,
      squareOffMinute: paperSession.squareOffMinute,
      productType: paperSession.productType,
      orderType: paperSession.orderType,
      limitMode: paperSession.limitMode,
      limitValue: paperSession.limitValue,
      pendingLimitPrice: paperSession.pendingLimitPrice,
      pendingLimitExpiresDay: paperSession.pendingLimitExpiresDay,
      pendingLimitFromTime: paperSession.pendingLimitFromTime,
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
    market,
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
    intraday: isIntraday(paperSession.timeframe as CandleInterval),
  };

  // Guarded on the state we read: if the Sync button and the schedule run
  // at once, only the first write lands and the other is rolled back, so a
  // fill is never recorded twice.
  const sessionWrite = {
    where: { id, status: "ACTIVE", lastSyncedTime: paperSession.lastSyncedTime },
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
      pendingLimitPrice: result.pendingEntry?.limitPrice ?? null,
      pendingLimitExpiresDay: result.pendingEntry?.expiresDay ?? null,
      pendingLimitFromTime: result.pendingEntry?.fromTime ?? null,
      status: postCheck.breach ? "STOPPED" : undefined,
    },
  } satisfies Prisma.PaperSessionUpdateManyArgs;

  const writes: ((tx: Tx) => Promise<unknown>)[] = [
    ...result.newOrders.map((o) =>
      (tx: Tx) => tx.paperOrder.create({
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
          (tx: Tx) => tx.notification.create({
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
          (tx: Tx) => tx.notification.create({
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

  const breach = postCheck.breach;
  if (breach) {
    const message = `${paperSession.strategyName} (${paperSession.instrumentSymbol}): ${breach.message}`;
    writes.push(
      (tx: Tx) => tx.riskEvent.create({
        data: { userId, paperSessionId: id, type: breach.type, message },
      }),
      (tx: Tx) => tx.notification.create({
        data: { userId, paperSessionId: id, type: "SESSION_STOPPED", message: `Session stopped — ${message}` },
      }),
    );
  } else if (!preCheck.allowNewEntries && riskContext.killSwitchEnabled && result.suppressedEntrySignal) {
    const message = `${paperSession.strategyName} (${paperSession.instrumentSymbol}): an entry signal fired but was blocked — kill switch is on.`;
    writes.push(
      (tx: Tx) => tx.riskEvent.create({
        data: { userId, paperSessionId: id, type: "KILL_SWITCH_BLOCKED", message },
      }),
      (tx: Tx) => tx.notification.create({
        data: { userId, paperSessionId: id, type: "RISK_EVENT", message },
      }),
    );
  }

  if (result.sizeTooSmall) {
    writes.push(
      (tx: Tx) => tx.notification.create({
        data: {
          userId,
          paperSessionId: id,
          type: "RISK_EVENT",
          message: `${paperSession.strategyName} (${paperSession.instrumentSymbol}): an entry signal fired but the configured position size rounds to 0 shares at the current price — skipped.`,
        },
      }),
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.paperSession.updateMany(sessionWrite);
      if (claimed.count === 0) throw new SyncConflict();
      for (const w of writes) await w(tx);
    });
  } catch (err) {
    // Someone else synced this session a moment ago — their result stands.
    if (err instanceof SyncConflict) return {};
    throw err;
  }

  revalidatePaperPaths(id);
  return {};
}
