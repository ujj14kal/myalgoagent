"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

// A real layout (a few dozen drawings + indicator settings) is a few KB. The
// cap stops a session from parking arbitrarily large blobs in a JSON column.
const MAX_LAYOUT_BYTES = 100_000;

export type SaveChartLayoutResult = { ok: true } | { ok: false; error: string };

export async function saveChartLayout(
  instrumentId: string,
  config: Record<string, unknown>,
): Promise<SaveChartLayoutResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  try {
    await enforceRateLimit(`chart-layout:${session.user.id}`, 30, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  if (typeof instrumentId !== "string" || !instrumentId) return { ok: false, error: "Invalid instrument." };
  if (JSON.stringify(config ?? {}).length > MAX_LAYOUT_BYTES) {
    return { ok: false, error: "This layout is too large to save — try removing some drawings." };
  }

  try {
    await prisma.chartLayout.upsert({
      where: { userId_instrumentId: { userId: session.user.id, instrumentId } },
      update: { config: config as unknown as Prisma.InputJsonValue },
      create: { userId: session.user.id, instrumentId, config: config as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    logError("chart-layout-actions:saveChartLayout", err, { userId: session.user.id, instrumentId });
    return { ok: false, error: "Couldn't save your layout — please try again." };
  }

  return { ok: true };
}
