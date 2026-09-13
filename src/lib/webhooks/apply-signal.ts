import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { evaluateRisk } from "@/lib/risk/evaluate";
import { computeQuantity, resolveRiskLevels, type PositionSizing, type RiskManagementConfig } from "@/lib/trading-engine/step";
import type { PaperSession } from "@prisma/client";
import type { WebhookAction } from "./tradingview";

export interface ApplySignalResult {
  executed: boolean;
  paperOrderId?: string;
  error?: string;
}

function riskManagementFromSession(session: PaperSession): RiskManagementConfig {
  return {
    stopLoss: session.stopLossEnabled ? { enabled: true, unit: session.stopLossUnit!, value: session.stopLossValue! } : null,
    target: session.targetEnabled ? { enabled: true, unit: session.targetUnit!, value: session.targetValue! } : null,
    trailingSl: session.trailingSlEnabled
      ? { enabled: true, unit: session.trailingSlUnit!, value: session.trailingSlValue! }
      : null,
  };
}

/**
 * A webhook alert means "act now" — it can't wait for the next EOD sync's
 * next-bar-open fill (see stepBar in trading-engine/step.ts), so this is a
 * deliberately separate, simpler "immediate fill" path rather than a reuse
 * of the backtest-style engine. Two data fetches are needed, for different
 * reasons: an intraday quote for a realistic fill *price* (the whole point
 * of reacting immediately), and the latest *daily* candle purely for its
 * timestamp — positionEntryTime must line up with a real daily-candle time,
 * because syncPaperSession (src/lib/paper/sync.ts) looks up the open
 * position's entry bar by exact time match against daily candles on every
 * subsequent "Sync now"; an intraday timestamp there would never match and
 * would permanently break that session's EOD sync.
 */
async function fetchFillPriceAndDayTime(symbol: string): Promise<{ price: number; dayTime: number }> {
  const [intraday, daily] = await Promise.all([
    marketDataProvider.getHistoricalCandles(symbol, "1d", "1m"),
    marketDataProvider.getHistoricalCandles(symbol, "5d", "1d"),
  ]);
  const latestIntraday = intraday.at(-1);
  const latestDaily = daily.at(-1);
  if (!latestIntraday || !latestDaily) {
    throw new Error(`No market data available for ${symbol}`);
  }
  return { price: latestIntraday.close, dayTime: latestDaily.time };
}

/**
 * Opens or closes a paper position immediately, in response to a webhook
 * signal, bypassing the entry/exit condition tree entirely (a webhook-mode
 * strategy has no condition tree — see NEVER_EXIT_CONDITION usage in
 * strategy-actions.ts). A BUY while already in a position, or a SELL while
 * flat, is a deliberate no-op — pyramiding into a webhook-opened position
 * isn't supported in this first version, kept simple rather than
 * re-implementing stepBar's blended-entry math here.
 */
export async function applyWebhookSignal(session: PaperSession, action: WebhookAction): Promise<ApplySignalResult> {
  if (session.status !== "ACTIVE") {
    return { executed: false, error: "Paper session is not active" };
  }

  const hasPosition = session.positionEntryPrice !== null && session.positionQuantity !== null;
  if (action === "BUY" && hasPosition) {
    return { executed: false, error: "Already in a position — BUY signal ignored" };
  }
  if (action === "SELL" && !hasPosition) {
    return { executed: false, error: "No open position — SELL signal ignored" };
  }

  const riskSettings = await prisma.riskSettings.findUnique({ where: { userId: session.userId } });
  const recentClosedOrders = await prisma.paperOrder.findMany({
    where: { paperSessionId: session.id, side: "SELL" },
    orderBy: { time: "desc" },
    take: 20,
  });
  const priorEquity = session.cash + (session.positionEntryPrice ?? 0) * (session.positionQuantity ?? 0);
  const riskCheck = evaluateRisk(
    { startingCapital: session.startingCapital, currentEquity: priorEquity, recentNetPnls: recentClosedOrders.map((o) => o.netPnl ?? 0) },
    {
      killSwitchEnabled: riskSettings?.killSwitchEnabled ?? false,
      maxLossPercent: riskSettings?.maxLossPercent ?? null,
      maxConsecutiveLosses: riskSettings?.maxConsecutiveLosses ?? null,
    },
  );

  if (action === "BUY" && !riskCheck.allowNewEntries) {
    return { executed: false, error: "Blocked by risk kill switch / limit" };
  }

  const { price, dayTime } = await fetchFillPriceAndDayTime(session.instrumentSymbol);
  const positionSizing: PositionSizing = { mode: session.positionSizingMode, value: session.positionSizingValue };

  if (action === "BUY") {
    const quantity = computeQuantity(session.cash, price, positionSizing);
    if (quantity <= 0) {
      return { executed: false, error: "Configured position size rounds to 0 shares at the current price" };
    }
    const { stopLossPrice, targetPrice } = resolveRiskLevels(riskManagementFromSession(session), price, undefined);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.paperOrder.create({
        data: { paperSessionId: session.id, side: "BUY", time: dayTime, price, quantity, fees: 0, netPnl: null },
      });
      await tx.paperSession.update({
        where: { id: session.id },
        data: {
          positionEntryTime: dayTime,
          positionEntryPrice: price,
          positionQuantity: quantity,
          positionFavorableExtreme: price,
          positionStopLossPrice: stopLossPrice,
          positionTargetPrice: targetPrice,
          positionPyramidCount: 1,
        },
      });
      await tx.notification.create({
        data: {
          userId: session.userId,
          paperSessionId: session.id,
          type: "ORDER_FILLED",
          message: `Bought ${quantity} ${session.instrumentSymbol} at ₹${price.toFixed(2)} (${session.strategyName}) — via webhook signal.`,
        },
      });
      return created;
    });
    return { executed: true, paperOrderId: order.id };
  }

  // SELL — close the open position at the fetched price.
  const entryPrice = session.positionEntryPrice!;
  const quantity = session.positionQuantity!;
  const entryValue = entryPrice * quantity;
  const exitValue = price * quantity;
  const grossPnl = exitValue - entryValue;
  const fees = (entryValue + exitValue) * (session.brokeragePercent / 100);
  const netPnl = grossPnl - fees;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.paperOrder.create({
      data: { paperSessionId: session.id, side: "SELL", time: dayTime, price, quantity, fees, netPnl },
    });
    await tx.paperSession.update({
      where: { id: session.id },
      data: {
        cash: session.cash + netPnl,
        positionEntryTime: null,
        positionEntryPrice: null,
        positionQuantity: null,
        positionFavorableExtreme: null,
        positionStopLossPrice: null,
        positionTargetPrice: null,
        positionPyramidCount: 1,
      },
    });
    await tx.notification.create({
      data: {
        userId: session.userId,
        paperSessionId: session.id,
        type: "ORDER_FILLED",
        message: `Sold ${quantity} ${session.instrumentSymbol} at ₹${price.toFixed(2)} (${session.strategyName}) — via webhook signal.`,
      },
    });
    return created;
  });
  return { executed: true, paperOrderId: order.id };
}
