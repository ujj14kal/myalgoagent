import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// The engine's activity log for the signed-in user. `after` returns lines newer than a timestamp
// (the live feed polls with it); `before` pages back into older lines.

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    await enforceRateLimit(`live-log:${userId}`, 60, 60_000);

    const p = request.nextUrl.searchParams;
    const after = p.get("after");
    const before = p.get("before");
    const deploymentId = p.get("deployment");
    const afterDate = after ? new Date(after) : null;
    const beforeDate = before ? new Date(before) : null;
    if ((afterDate && Number.isNaN(afterDate.getTime())) || (beforeDate && Number.isNaN(beforeDate.getTime()))) return NextResponse.json({ error: "Invalid time." }, { status: 400 });

    const rows = await prisma.liveEngineLog.findMany({
      where: {
        userId,
        ...(deploymentId ? { deploymentId } : {}),
        ...(afterDate ? { at: { gt: afterDate } } : {}),
        ...(beforeDate ? { at: { lt: beforeDate } } : {}),
      },
      orderBy: { at: "desc" },
      take: 60,
      select: { id: true, at: true, level: true, message: true, deploymentId: true },
    });
    return NextResponse.json({ lines: rows.map((r) => ({ ...r, at: r.at.toISOString() })), serverTime: new Date().toISOString() });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    logError("api/live/log", err);
    return NextResponse.json({ error: "Couldn't load the activity log." }, { status: 500 });
  }
}
