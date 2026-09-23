"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

const MAX_WATCHLIST_ITEMS = 100;

export type WatchlistActionResult = { ok: true } | { ok: false; error: string };

async function guard(userId: string): Promise<WatchlistActionResult | null> {
  try {
    await enforceRateLimit(`watchlist:${userId}`, 60, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
  return null;
}

export async function addToWatchlist(instrumentId: string): Promise<WatchlistActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const blocked = await guard(userId);
  if (blocked) return blocked;

  try {
    const alreadyThere = await prisma.watchlistItem.findUnique({
      where: { userId_instrumentId: { userId, instrumentId } },
      select: { id: true },
    });
    if (!alreadyThere) {
      const count = await prisma.watchlistItem.count({ where: { userId } });
      if (count >= MAX_WATCHLIST_ITEMS) {
        return { ok: false, error: `Your watchlist is full (${MAX_WATCHLIST_ITEMS} instruments) — remove one to add another.` };
      }
    }

    await prisma.watchlistItem.upsert({
      where: { userId_instrumentId: { userId, instrumentId } },
      update: {},
      create: { userId, instrumentId },
    });
  } catch (err) {
    logError("watchlist-actions:addToWatchlist", err, { userId, instrumentId });
    return { ok: false, error: "Couldn't add that instrument — please try again." };
  }

  revalidatePath("/app/watchlist");
  return { ok: true };
}

export async function removeFromWatchlist(watchlistItemId: string): Promise<WatchlistActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const blocked = await guard(userId);
  if (blocked) return blocked;

  try {
    await prisma.watchlistItem.deleteMany({
      where: { id: watchlistItemId, userId },
    });
  } catch (err) {
    logError("watchlist-actions:removeFromWatchlist", err, { userId, watchlistItemId });
    return { ok: false, error: "Couldn't remove that instrument — please try again." };
  }

  revalidatePath("/app/watchlist");
  return { ok: true };
}
