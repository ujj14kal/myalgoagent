"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { syncPaperSession } from "@/lib/paper/sync";
import { evaluateRisk } from "@/lib/risk/evaluate";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface StartPaperSessionInput {
  strategyId: string;
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
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

export async function startPaperSession(input: StartPaperSessionInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (input.startingCapital <= 0) throw new Error("Starting capital must be positive");
  if (input.brokeragePercent < 0 || input.slippagePercent < 0) {
    throw new Error("Brokerage and slippage must be zero or positive");
  }

  const strategy = await prisma.strategy.findFirst({
    where: { id: input.strategyId, userId: session.user.id },
    include: { instrument: true },
  });
  if (!strategy) throw new Error("Strategy not found");

  const candles = await marketDataProvider.getHistoricalCandles(strategy.instrument.symbol, "1mo", "1d");
  if (candles.length === 0) throw new Error("No historical data available for this instrument");
  const latestTime = candles.at(-1)!.time;

  const paperSession = await prisma.paperSession.create({
    data: {
      userId: session.user.id,
      strategyId: strategy.id,
      strategyName: strategy.name,
      instrumentSymbol: strategy.instrument.symbol,
      entryCondition: strategy.entryCondition as unknown as Prisma.InputJsonValue,
      exitCondition: strategy.exitCondition as unknown as Prisma.InputJsonValue,
      startingCapital: input.startingCapital,
      brokeragePercent: input.brokeragePercent,
      slippagePercent: input.slippagePercent,
      cash: input.startingCapital,
      lastSyncedTime: latestTime,
    },
  });

  revalidatePaperPaths();
  redirect(`/app/paper-trading/${paperSession.id}`);
}

export async function syncPaperSessionAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const paperSession = await prisma.paperSession.findFirst({ where: { id, userId } });
  if (!paperSession) throw new Error("Paper session not found");
  if (paperSession.status !== "ACTIVE") throw new Error("This session is not active");

  const riskSettings = await prisma.riskSettings.findUnique({ where: { userId } });
  const riskContext = {
    killSwitchEnabled: riskSettings?.killSwitchEnabled ?? false,
    maxLossPercent: riskSettings?.maxLossPercent ?? null,
    maxConsecutiveLosses: riskSettings?.maxConsecutiveLosses ?? null,
  };

  const recentClosedOrders = await prisma.paperOrder.findMany({
    where: { paperSessionId: id, side: "SELL" },
    orderBy: { time: "desc" },
    take: 20,
  });
  const priorEquity =
    paperSession.cash + (paperSession.positionEntryPrice ?? 0) * (paperSession.positionQuantity ?? 0);

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
      entryCondition: paperSession.entryCondition as unknown as ConditionNode,
      exitCondition: paperSession.exitCondition as unknown as ConditionNode,
      brokeragePercent: paperSession.brokeragePercent,
      slippagePercent: paperSession.slippagePercent,
      cash: paperSession.cash,
      positionEntryTime: paperSession.positionEntryTime,
      positionEntryPrice: paperSession.positionEntryPrice,
      positionQuantity: paperSession.positionQuantity,
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

  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.paperSession.update({
      where: { id },
      data: {
        cash: result.cash,
        positionEntryTime: result.position ? result.position.entryTime : null,
        positionEntryPrice: result.position ? result.position.entryPrice : null,
        positionQuantity: result.position ? result.position.quantity : null,
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
    ...result.newOrders.map((o) =>
      prisma.notification.create({
        data: {
          userId,
          paperSessionId: id,
          type: "ORDER_FILLED",
          message: `${o.side === "BUY" ? "Bought" : "Sold"} ${o.quantity} ${paperSession.instrumentSymbol} at ₹${o.price.toFixed(2)} (${paperSession.strategyName})`,
        },
      }),
    ),
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

  await prisma.$transaction(writes);

  revalidatePaperPaths(id);
}

export async function setPaperSessionStatus(id: string, status: "ACTIVE" | "PAUSED" | "STOPPED") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.paperSession.updateMany({
    where: { id, userId: session.user.id },
    data: { status },
  });

  revalidatePaperPaths(id);
}
