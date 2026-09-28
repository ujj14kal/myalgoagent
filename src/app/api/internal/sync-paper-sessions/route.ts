import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { internalSecretMatches } from "@/lib/internal-auth";
import { syncPaperSessionFor } from "@/lib/paper/sync-session";
import { inMarketWindow } from "@/lib/paper/market-window";

// Called every few minutes on weekdays by an EventBridge schedule, so open
// paper trades close on their own when a stop-loss, target or trailing stop
// is hit — the user doesn't have to open the session and press Sync.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 4;
const BUDGET_MS = 25_000;

export async function POST(req: NextRequest) {
  if (!internalSecretMatches(req.headers.get("x-purge-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !inMarketWindow(new Date())) return NextResponse.json({ skipped: "market closed" });

  const started = Date.now();
  try {
    // Least recently updated first, so a run cut short by the time budget
    // picks up where it stopped next time.
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
          logError("api/internal/sync-paper-sessions", err, { paperSessionId: s.id });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const pending = sessions.length - synced - failed;
    if (pending > 0) logWarn("paper.sync.budget", "Scheduled sync ran out of time", { total: sessions.length, pending });
    return NextResponse.json({ total: sessions.length, synced, failed, pending, ms: Date.now() - started });
  } catch (err) {
    logError("api/internal/sync-paper-sessions", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
