import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The client polls this every 15s (4/min) — 60/min leaves generous
    // headroom for multiple tabs while still stopping a runaway loop.
    await enforceRateLimit(`notifications-poll:${session.user.id}`, 60, 60_000);

    const since = request.nextUrl.searchParams.get("since");
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 60_000);
    if (Number.isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: "Invalid 'since' timestamp" }, { status: 400 });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id, createdAt: { gt: sinceDate } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    logError("api/notifications/recent", err);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
