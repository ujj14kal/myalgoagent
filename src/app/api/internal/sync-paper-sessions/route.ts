import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { internalSecretMatches } from "@/lib/internal-auth";
import { inMarketWindow } from "@/lib/paper/market-window";
import { recordJob } from "@/lib/jobs";
import { runScheduledPaperSync } from "@/lib/paper/scheduled-sync";

// Called every few minutes on weekdays by an EventBridge schedule, so open
// paper trades close on their own when a stop-loss, target or trailing stop
// is hit — the user doesn't have to open the session and press Sync.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!internalSecretMatches(req.headers.get("x-purge-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !inMarketWindow(new Date())) return NextResponse.json({ skipped: "market closed" });

  try {
    return NextResponse.json(await recordJob("paper-sync", runScheduledPaperSync));
  } catch (err) {
    logError("api/internal/sync-paper-sessions", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
