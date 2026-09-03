"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { syncPaperSession } from "@/lib/paper/sync";
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

  const paperSession = await prisma.paperSession.findFirst({ where: { id, userId: session.user.id } });
  if (!paperSession) throw new Error("Paper session not found");
  if (paperSession.status !== "ACTIVE") throw new Error("This session is not active");

  const result = await syncPaperSession({
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
  });

  await prisma.$transaction([
    prisma.paperSession.update({
      where: { id },
      data: {
        cash: result.cash,
        positionEntryTime: result.position ? result.position.entryTime : null,
        positionEntryPrice: result.position ? result.position.entryPrice : null,
        positionQuantity: result.position ? result.position.quantity : null,
        lastSyncedTime: result.lastSyncedTime,
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
  ]);

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
