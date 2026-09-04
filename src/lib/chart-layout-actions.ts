"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function saveChartLayout(instrumentId: string, config: Record<string, unknown>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.chartLayout.upsert({
    where: { userId_instrumentId: { userId: session.user.id, instrumentId } },
    update: { config: config as unknown as Prisma.InputJsonValue },
    create: { userId: session.user.id, instrumentId, config: config as unknown as Prisma.InputJsonValue },
  });
}
