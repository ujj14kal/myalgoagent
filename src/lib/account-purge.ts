import "server-only";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { pruneJobRuns } from "@/lib/jobs";

export type PurgeSummary = { purged: number; failed: number; prunedRuns: number; prunedAudit: number };

/** Permanently deletes accounts whose deletion window has passed, and trims old operational records. */
export async function runAccountPurge(): Promise<PurgeSummary> {
  const due = await prisma.user.findMany({
    where: { status: "PENDING_DELETION", deletionScheduledFor: { lte: new Date() } },
    select: { id: true },
  });

  let purged = 0;
  let failed = 0;
  for (const user of due) {
    // Isolated per user: one account failing to delete (e.g. a transient
    // DB error) must not abort the rest of the batch — they'd all wait
    // for the next run, and this is a data-deletion obligation.
    try {
      // Every related model has onDelete: Cascade back to User, so this
      // deletes strategies, backtests, paper sessions, orders, etc. too.
      // Support cases are the exception (SetNull, so requests sent while
      // signed out survive) — the privacy policy promises they go with the account.
      await prisma.$transaction([prisma.supportCase.deleteMany({ where: { userId: user.id } }), prisma.user.delete({ where: { id: user.id } })]);
      purged++;
    } catch (err) {
      failed++;
      logError("account-purge", err, { userId: user.id });
    }
  }
  const prunedRuns = await pruneJobRuns().catch(() => 0);
  // Admin audit records are kept for two years (privacy policy, "Data retention").
  const prunedAudit = await prisma.adminAuditLog
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 730 * 86_400_000) } } })
    .then((r) => r.count)
    .catch(() => 0);
  return { purged, failed, prunedRuns, prunedAudit };
}
