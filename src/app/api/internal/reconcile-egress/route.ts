import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { internalSecretMatches } from "@/lib/internal-auth";
import { recordJob } from "@/lib/jobs";
import { reconcileEgress } from "@/lib/egress/service";

// Called every few minutes by an EventBridge schedule: moves each paid account's static-IP relay one step further
// (create, check, release after the grace period). A no-op until USER_EGRESS_ENABLED=1.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!internalSecretMatches(req.headers.get("x-purge-secret"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await recordJob("user-egress", reconcileEgress));
  } catch (err) {
    logError("api/internal/reconcile-egress", err);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
