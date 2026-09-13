"use server";

import { randomUUID, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export interface WebhookActionResult {
  token?: string;
  error?: string;
}

/**
 * Generates a fresh webhook URL for a WEBHOOK-mode strategy, immediately
 * invalidating any previous one (old raw token's hash no longer matches).
 * Only the hash is ever stored — the raw token is returned once, here, the
 * same one-way pattern used for password-reset/magic-link tokens
 * (src/lib/account-actions.ts).
 */
export async function regenerateWebhookToken(strategyId: string): Promise<WebhookActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  try {
    await enforceRateLimit(`webhook-token:${session.user.id}`, 10, 60_000);

    const strategy = await prisma.strategy.findFirst({ where: { id: strategyId, userId: session.user.id } });
    if (!strategy) return { error: "Strategy not found" };
    if (strategy.mode !== "WEBHOOK") return { error: "This strategy isn't in Webhook mode" };

    const rawToken = randomUUID();
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { webhookTokenHash: tokenHash, webhookEnabled: true },
    });

    revalidatePath(`/app/strategies/${strategyId}`);
    return { token: rawToken };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function setWebhookEnabled(strategyId: string, enabled: boolean): Promise<WebhookActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  await prisma.strategy.updateMany({
    where: { id: strategyId, userId: session.user.id, mode: "WEBHOOK" },
    data: { webhookEnabled: enabled },
  });

  revalidatePath(`/app/strategies/${strategyId}`);
  return {};
}
