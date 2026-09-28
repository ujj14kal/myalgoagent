"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

export interface RiskSettingsInput {
  killSwitchEnabled: boolean;
  maxLossPercent: number | null;
  maxConsecutiveLosses: number | null;
  /** Live-order caps; left unchanged when omitted, back to the defaults when null. */
  liveMaxOrderValue?: number | null;
  liveMaxOrdersPerDay?: number | null;
}

// Returned (not thrown): Next.js redacts the message of any Error thrown
// across a Server Action boundary in production, so a thrown validation
// message never reached the person who needed to read it.
export type RiskActionResult = { ok: true } | { ok: false; error: string };

function revalidateRiskPaths() {
  revalidatePath("/app/risk-controls");
  revalidatePath("/app/dashboard");
}

export async function updateRiskSettings(input: RiskSettingsInput): Promise<RiskActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  try {
    await enforceRateLimit(`risk-settings:${session.user.id}`, 30, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  // Number.isFinite, not just range checks: NaN fails both `<= 0` and
  // `> 100`, so it used to sail through validation and get stored — after
  // which every "loss >= limit" comparison is false and the limit silently
  // never fires. That's a safety control quietly turned off.
  if (input.maxLossPercent !== null) {
    if (!Number.isFinite(input.maxLossPercent) || input.maxLossPercent <= 0 || input.maxLossPercent > 100) {
      return { ok: false, error: "Max loss % must be a number between 0 and 100." };
    }
  }
  if (input.maxConsecutiveLosses !== null) {
    if (!Number.isInteger(input.maxConsecutiveLosses) || input.maxConsecutiveLosses < 1) {
      return { ok: false, error: "Max consecutive losses must be a whole number, at least 1." };
    }
  }
  if (input.liveMaxOrderValue !== undefined && input.liveMaxOrderValue !== null) {
    if (!Number.isFinite(input.liveMaxOrderValue) || input.liveMaxOrderValue < 500 || input.liveMaxOrderValue > 10_00_000) {
      return { ok: false, error: "The live per-order limit must be between ₹500 and ₹10,00,000." };
    }
  }
  if (input.liveMaxOrdersPerDay !== undefined && input.liveMaxOrdersPerDay !== null) {
    if (!Number.isInteger(input.liveMaxOrdersPerDay) || input.liveMaxOrdersPerDay < 1 || input.liveMaxOrdersPerDay > 200) {
      return { ok: false, error: "Live orders per day must be a whole number between 1 and 200." };
    }
  }
  if (typeof input.killSwitchEnabled !== "boolean") {
    return { ok: false, error: "Invalid kill switch value." };
  }

  try {
    const data = {
      killSwitchEnabled: input.killSwitchEnabled,
      maxLossPercent: input.maxLossPercent,
      maxConsecutiveLosses: input.maxConsecutiveLosses,
      ...(input.liveMaxOrderValue !== undefined ? { liveMaxOrderValue: input.liveMaxOrderValue } : {}),
      ...(input.liveMaxOrdersPerDay !== undefined ? { liveMaxOrdersPerDay: input.liveMaxOrdersPerDay } : {}),
    };
    await prisma.riskSettings.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, ...data },
    });
  } catch (err) {
    logError("risk-actions:updateRiskSettings", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't save your limits — please try again." };
  }

  revalidateRiskPaths();
  return { ok: true };
}

export async function toggleKillSwitch(enabled: boolean): Promise<RiskActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  try {
    await enforceRateLimit(`kill-switch:${session.user.id}`, 30, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  try {
    await prisma.riskSettings.upsert({
      where: { userId: session.user.id },
      update: { killSwitchEnabled: enabled },
      create: { userId: session.user.id, killSwitchEnabled: enabled },
    });
  } catch (err) {
    logError("risk-actions:toggleKillSwitch", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't update the kill switch — please try again." };
  }

  revalidateRiskPaths();
  return { ok: true };
}
