import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { liveDashboardPnl } from "@/lib/live/pnl-server";
import { logError } from "@/lib/logger";

// The dashboard's live P&L card polls this every few seconds while the market is open.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceRateLimit(`live-pnl:${userId}`, 60, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }
  try {
    return NextResponse.json(await liveDashboardPnl(userId), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logError("api/live/pnl", err, { userId });
    return NextResponse.json({ error: "Couldn't read your live P&L just now." }, { status: 502 });
  }
}
