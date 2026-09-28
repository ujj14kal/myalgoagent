import "server-only";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { syncPaperSessionFor } from "@/lib/paper/sync-session";

const CONCURRENCY = 4;
const BUDGET_MS = 25_000;

export type PaperSyncSummary = { total: number; synced: number; failed: number; pending: number; ms: number };

/**
 * One pass over every ACTIVE paper session, so open trades close on their own
 * when a stop-loss, target or trailing stop is hit. Least recently updated
 * first, so a pass cut short by the time budget resumes where it stopped.
 */
export async function runScheduledPaperSync(): Promise<PaperSyncSummary> {
  const started = Date.now();
  const sessions = await prisma.paperSession.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, userId: true },
    orderBy: { updatedAt: "asc" },
  });

  let synced = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < sessions.length && Date.now() - started < BUDGET_MS) {
      const s = sessions[next++];
      try {
        await syncPaperSessionFor(s.id, s.userId, { scheduled: true });
        synced++;
      } catch (err) {
        // One session's bad data or a data-provider hiccup must not stop the rest.
        failed++;
        logError("paper.scheduled-sync", err, { paperSessionId: s.id });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const pending = sessions.length - synced - failed;
  if (pending > 0) logWarn("paper.sync.budget", "Scheduled sync ran out of time", { total: sessions.length, pending });
  return { total: sessions.length, synced, failed, pending, ms: Date.now() - started };
}
