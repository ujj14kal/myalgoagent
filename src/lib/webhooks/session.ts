import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { activateStrategyIfDraft } from "@/lib/strategy-actions";
import type { Strategy, PaperSession } from "@prisma/client";

// Same defaults shown to a user starting a paper session by hand
// (src/components/paper-session-form.tsx) — a webhook-mode strategy has no
// equivalent form, so the first alert that arrives auto-starts a session
// with these instead of asking the user to configure them up front.
const DEFAULT_STARTING_CAPITAL = 100_000;
const DEFAULT_BROKERAGE_PERCENT = 0.03;
const DEFAULT_SLIPPAGE_PERCENT = 0.05;

/**
 * Webhook-mode strategies have no condition tree to sync against, so unlike
 * a normal strategy's paper session, this one never needs `syncPaperSession`
 * — every state change comes from applyWebhookSignal reacting to an alert
 * directly. Still reuses the same PaperSession model/table so it shows up
 * in the existing paper-trading pages, orders list, and portfolio view.
 */
export async function getOrCreateActivePaperSession(
  strategy: Strategy & { instrument: { symbol: string } },
): Promise<PaperSession> {
  const existing = await prisma.paperSession.findFirst({
    where: { strategyId: strategy.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    // Defensive — the DB trigger (see migration add_strategy_active_trigger)
    // already handles this on insert, but an existing session found here
    // could predate that trigger, same class of bug as the one it fixes.
    await activateStrategyIfDraft(strategy.id);
    return existing;
  }

  const candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, "1mo", "1d");
  const latestTime = candles.at(-1)?.time ?? Math.floor(Date.now() / 1000);

  return prisma.paperSession.create({
    data: {
      userId: strategy.userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      instrumentSymbol: strategy.instrument.symbol,
      direction: strategy.direction,
      entryCondition: strategy.entryCondition as object,
      exitCondition: strategy.exitCondition as object,
      startingCapital: DEFAULT_STARTING_CAPITAL,
      brokeragePercent: DEFAULT_BROKERAGE_PERCENT,
      slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
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
      alertOnly: false,
      cash: DEFAULT_STARTING_CAPITAL,
      lastSyncedTime: latestTime,
    },
  });
}
