import { prisma } from "@/lib/prisma";

/** Days between a deletion request and the account being permanently purged. */
export const DELETION_WINDOW_DAYS = 15;

export const SUSPENDED_MESSAGE = "This account has been suspended. If you think this is a mistake, contact support@myalgoagent.com.";

/** Cancels a pending account deletion if the user logs back in before the 15-day window elapses. */
export async function reactivateIfPending(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, deletionScheduledFor: true },
  });
  if (user?.status === "PENDING_DELETION" && user.deletionScheduledFor && user.deletionScheduledFor > new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", deletionRequestedAt: null, deletionScheduledFor: null },
    });
  }
}
