import { prisma } from "@/lib/prisma";

// Internal helpers — deliberately NOT in a "use server" file, since every
// export there becomes an action any browser can call.

/** Promotes a strategy from DRAFT to ACTIVE the moment it's actually put to
 * work — currently: starting a paper trading session. Never touches a
 * strategy that's already ACTIVE or that's been deliberately ARCHIVED, and
 * only ever one belonging to `userId`. */
export async function activateStrategyIfDraft(strategyId: string, userId: string) {
  await prisma.strategy.updateMany({
    where: { id: strategyId, userId, status: "DRAFT" },
    data: { status: "ACTIVE" },
  });
}
