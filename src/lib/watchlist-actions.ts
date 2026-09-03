"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function addToWatchlist(instrumentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.watchlistItem.upsert({
    where: { userId_instrumentId: { userId: session.user.id, instrumentId } },
    update: {},
    create: { userId: session.user.id, instrumentId },
  });

  revalidatePath("/app/watchlist");
}

export async function removeFromWatchlist(watchlistItemId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.watchlistItem.deleteMany({
    where: { id: watchlistItemId, userId: session.user.id },
  });

  revalidatePath("/app/watchlist");
}
