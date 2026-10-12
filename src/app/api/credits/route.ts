import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { snapshot } from "@/lib/credits/service";
import { logError } from "@/lib/logger";

// The live credit meter reads this: right after anything is spent, when the tab comes back, and every few seconds while it is open.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceRateLimit(`credits:${userId}`, 120, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }
  try {
    return NextResponse.json(await snapshot(userId), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logError("api/credits", err, { userId });
    return NextResponse.json({ error: "Couldn't read your credits just now." }, { status: 502 });
  }
}
