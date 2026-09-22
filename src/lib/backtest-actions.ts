"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider, type CandleRange } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtest/run";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface RunBacktestInput {
  strategyId: string;
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
  range: CandleRange;
}

export interface BacktestActionResult {
  error?: string;
}

/**
 * Validation failures are returned as plain data (`{ error }`), never
 * thrown — Next.js redacts custom Error messages thrown across a Server
 * Action boundary in production builds, replacing them with a generic,
 * unhelpful placeholder the user can't act on. Only `redirect()`'s own
 * internal throw (on success) is exempt, which is why it stays outside the
 * try block below. See strategy-actions.ts for the same fix and fuller
 * explanation — this action had the identical bug.
 */
export async function runBacktestAction(input: RunBacktestInput): Promise<BacktestActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  let runId: string;
  try {
    await enforceRateLimit(`backtest:${session.user.id}`, 10, 60_000);

    if (input.startingCapital <= 0) throw new Error("Starting capital must be positive");
    if (input.brokeragePercent < 0 || input.slippagePercent < 0) {
      throw new Error("Brokerage and slippage must be zero or positive");
    }

    const strategy = await prisma.strategy.findFirst({
      where: { id: input.strategyId, userId: session.user.id },
      include: { instrument: true },
    });
    if (!strategy) throw new Error("Strategy not found");
    // Defense in depth against the dropdown filter — a deleted strategy
    // shouldn't be runnable even via a stale/direct request.
    if (strategy.status === "DELETED") throw new Error("This strategy has been deleted");

    // Execution/risk config is fixed on the strategy itself (see the
    // "bulletproof strategy creation" change) — a backtest always runs with
    // exactly what the strategy was saved with, never a value re-typed here.
    const positionSizing = { mode: strategy.positionSizingMode, value: strategy.positionSizingValue };
    const riskManagement = {
      stopLoss: strategy.stopLossEnabled
        ? { enabled: true, unit: strategy.stopLossUnit!, value: strategy.stopLossValue! }
        : null,
      target: strategy.targetEnabled
        ? { enabled: true, unit: strategy.targetUnit!, value: strategy.targetValue! }
        : null,
      trailingSl: strategy.trailingSlEnabled
        ? { enabled: true, unit: strategy.trailingSlUnit!, value: strategy.trailingSlValue! }
        : null,
    };

    const candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, input.range, "1d");
    if (candles.length === 0) throw new Error("No historical data available for this instrument");

    const entryCondition = strategy.entryCondition as unknown as ConditionNode;
    const exitCondition = strategy.exitCondition as unknown as ConditionNode;

    const aux = await fetchAuxCandles(entryCondition, exitCondition, strategy.instrument.symbol, input.range, "1d");

    const result = runBacktest(
      candles,
      entryCondition,
      exitCondition,
      {
        startingCapital: input.startingCapital,
        brokeragePercent: input.brokeragePercent,
        slippagePercent: input.slippagePercent,
        positionSizing,
        riskManagement,
        maxPyramidEntries: strategy.maxPyramidEntries,
        direction: strategy.direction,
      },
      aux,
    );

    const run = await prisma.backtestRun.create({
      data: {
        userId: session.user.id,
        strategyId: strategy.id,
        strategyName: strategy.name,
        instrumentSymbol: strategy.instrument.symbol,
        direction: strategy.direction,
        startingCapital: input.startingCapital,
        brokeragePercent: input.brokeragePercent,
        slippagePercent: input.slippagePercent,
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
        range: input.range,
        entryCondition: entryCondition as unknown as Prisma.InputJsonValue,
        exitCondition: exitCondition as unknown as Prisma.InputJsonValue,
        totalReturnPct: result.metrics.totalReturnPct,
        cagrPct: result.metrics.cagrPct,
        winRatePct: result.metrics.winRatePct,
        profitFactor: Number.isFinite(result.metrics.profitFactor) ? result.metrics.profitFactor : 999999,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
        sharpeRatio: result.metrics.sharpeRatio,
        expectancy: result.metrics.expectancy,
        tradeCount: result.metrics.tradeCount,
        equityCurve: result.equityCurve as unknown as Prisma.InputJsonValue,
        trades: {
          create: result.trades.map((t) => ({
            entryTime: t.entryTime,
            entryPrice: t.entryPrice,
            exitTime: t.exitTime,
            exitPrice: t.exitPrice,
            quantity: t.quantity,
            grossPnl: t.grossPnl,
            fees: t.fees,
            netPnl: t.netPnl,
            netPnlPct: t.netPnlPct,
            holdingBars: t.holdingBars,
          })),
        },
      },
    });
    runId = run.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }

  revalidatePath("/app/backtests");
  redirect(`/app/backtests/${runId}`);
}

export async function deleteBacktestRun(id: string): Promise<BacktestActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  await prisma.backtestRun.deleteMany({ where: { id, userId: session.user.id } });

  revalidatePath("/app/backtests");
  redirect("/app/backtests");
}
