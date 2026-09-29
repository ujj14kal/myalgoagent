import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// Latest trades for the chart's forming candle, polled every ~2 s during market
// hours. Only accounts on a live feed get anything (everyone else: live=false),
// so trial data never reaches other users.

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const market = marketDataFor(userId, "view");
  if (!market.getRecentTicks) return NextResponse.json({ live: false, ticks: [] });

  try {
    await enforceRateLimit(`instrument-live:${userId}`, 90, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  const { symbol } = await params;
  const instrument = await prisma.instrument.findUnique({ where: { symbol }, select: { id: true } });
  if (!instrument) return NextResponse.json({ error: "Unknown instrument" }, { status: 404 });

  const after = Number(request.nextUrl.searchParams.get("after") ?? 0) || 0;
  try {
    // A first poll gets enough to rebuild the current minute; later ones just what's new.
    const ticks = await market.getRecentTicks(symbol, after ? 60 : 200);
    return NextResponse.json({ live: true, provider: market.name, ticks: ticks.filter((t) => t.time > after) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("api/instruments/live", error, { symbol });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Live data unavailable" }, { status: 502 });
  }
}
