import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-purge-secret"), process.env.PURGE_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const due = await prisma.user.findMany({
      where: { status: "PENDING_DELETION", deletionScheduledFor: { lte: new Date() } },
      select: { id: true, email: true },
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
        await prisma.user.delete({ where: { id: user.id } });
        purged++;
      } catch (err) {
        failed++;
        logError("api/internal/purge-deleted-accounts", err, { userId: user.id });
      }
    }

    return NextResponse.json({ purged, failed }, { status: failed > 0 ? 207 : 200 });
  } catch (err) {
    logError("api/internal/purge-deleted-accounts", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
