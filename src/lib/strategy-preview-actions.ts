"use server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeStrategyPreview, type PreviewResult } from "@/lib/strategy-preview";
import type { StrategyInput } from "@/lib/strategy-actions";

/** "See it in action" for the signed-in user's unsaved draft — nothing is saved. */
export async function previewStrategy(input: StrategyInput): Promise<PreviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const limited = await checkRateLimit(`strategy-preview:${session.user.id}`, 20, 60_000);
  if (limited) return { ok: false, error: limited };
  return computeStrategyPreview(session.user.id, input);
}
