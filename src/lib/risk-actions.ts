"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface RiskSettingsInput {
  killSwitchEnabled: boolean;
  maxLossPercent: number | null;
  maxConsecutiveLosses: number | null;
}

function revalidateRiskPaths() {
  revalidatePath("/app/risk-controls");
  revalidatePath("/app/dashboard");
}

export async function updateRiskSettings(input: RiskSettingsInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (input.maxLossPercent !== null && (input.maxLossPercent <= 0 || input.maxLossPercent > 100)) {
    throw new Error("Max loss % must be between 0 and 100");
  }
  if (input.maxConsecutiveLosses !== null && input.maxConsecutiveLosses < 1) {
    throw new Error("Max consecutive losses must be at least 1");
  }

  await prisma.riskSettings.upsert({
    where: { userId: session.user.id },
    update: input,
    create: { userId: session.user.id, ...input },
  });

  revalidateRiskPaths();
}

export async function toggleKillSwitch(enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.riskSettings.upsert({
    where: { userId: session.user.id },
    update: { killSwitchEnabled: enabled },
    create: { userId: session.user.id, killSwitchEnabled: enabled },
  });

  revalidateRiskPaths();
}
