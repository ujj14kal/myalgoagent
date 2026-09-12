"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider, type CandleRange } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtest/run";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validatePositionSizing, type PositionSizingMode, type RiskLeg, type RiskUnit } from "@/lib/trading-engine/step";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface RiskLegInput {
  enabled: boolean;
  unit: RiskUnit;
  value: number;
}

export interface RunBacktestInput {
  strategyId: string;
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLoss: RiskLegInput;
  target: RiskLegInput;
  trailingSl: RiskLegInput;
  range: CandleRange;
}

function toRiskLeg(leg: RiskLegInput): RiskLeg {
  return { enabled: leg.enabled, unit: leg.unit, value: leg.value };
}

export async function runBacktestAction(input: RunBacktestInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await enforceRateLimit(`backtest:${session.user.id}`, 10, 60_000);

  if (input.startingCapital <= 0) throw new Error("Starting capital must be positive");
  if (input.brokeragePercent < 0 || input.slippagePercent < 0) {
    throw new Error("Brokerage and slippage must be zero or positive");
  }
  const positionSizing = { mode: input.positionSizingMode, value: input.positionSizingValue };
  validatePositionSizing(positionSizing);

  const strategy = await prisma.strategy.findFirst({
    where: { id: input.strategyId, userId: session.user.id },
    include: { instrument: true },
  });
  if (!strategy) throw new Error("Strategy not found");

  const candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, input.range, "1d");
  if (candles.length === 0) throw new Error("No historical data available for this instrument");

  const entryCondition = strategy.entryCondition as unknown as ConditionNode;
  const exitCondition = strategy.exitCondition as unknown as ConditionNode;

  const aux = await fetchAuxCandles(entryCondition, exitCondition, strategy.instrument.symbol, input.range, "1d");

  const riskManagement = {
    stopLoss: toRiskLeg(input.stopLoss),
    target: toRiskLeg(input.target),
    trailingSl: toRiskLeg(input.trailingSl),
  };

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
    },
    aux,
  );

  const run = await prisma.backtestRun.create({
    data: {
      userId: session.user.id,
      strategyId: strategy.id,
      strategyName: strategy.name,
      instrumentSymbol: strategy.instrument.symbol,
      startingCapital: input.startingCapital,
      brokeragePercent: input.brokeragePercent,
      slippagePercent: input.slippagePercent,
      positionSizingMode: input.positionSizingMode,
      positionSizingValue: input.positionSizingValue,
      stopLossEnabled: input.stopLoss.enabled,
      stopLossUnit: input.stopLoss.enabled ? input.stopLoss.unit : null,
      stopLossValue: input.stopLoss.enabled ? input.stopLoss.value : null,
      targetEnabled: input.target.enabled,
      targetUnit: input.target.enabled ? input.target.unit : null,
      targetValue: input.target.enabled ? input.target.value : null,
      trailingSlEnabled: input.trailingSl.enabled,
      trailingSlUnit: input.trailingSl.enabled ? input.trailingSl.unit : null,
      trailingSlValue: input.trailingSl.enabled ? input.trailingSl.value : null,
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

  revalidatePath("/app/backtests");
  redirect(`/app/backtests/${run.id}`);
}

export async function deleteBacktestRun(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.backtestRun.deleteMany({ where: { id, userId: session.user.id } });

  revalidatePath("/app/backtests");
  redirect("/app/backtests");
}
