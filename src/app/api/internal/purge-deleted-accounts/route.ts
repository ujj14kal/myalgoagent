import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { internalSecretMatches } from "@/lib/internal-auth";
import { recordJob } from "@/lib/jobs";
import { runDailyJob } from "@/lib/scheduled-jobs";

export async function POST(req: NextRequest) {
  if (!internalSecretMatches(req.headers.get("x-purge-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await recordJob("purge-deleted-accounts", runDailyJob);
    return NextResponse.json(summary, { status: summary.failed > 0 ? 207 : 200 });
  } catch (err) {
    logError("api/internal/purge-deleted-accounts", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
