"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

type Result = { ok: true } | { ok: false; error: string };

export async function markNotificationRead(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`notifications-mark:${session.user.id}`, 120, 60_000);
  if (limited) return { ok: false, error: limited };

  try {
    await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { read: true },
    });
  } catch (err) {
    logError("notification-actions:markRead", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't update that notification." };
  }

  revalidatePath("/app/notifications");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`notifications-mark:${session.user.id}`, 120, 60_000);
  if (limited) return { ok: false, error: limited };

  try {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
  } catch (err) {
    logError("notification-actions:markAllRead", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't update your notifications." };
  }

  revalidatePath("/app/notifications");
  return { ok: true };
}
