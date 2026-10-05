import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { chainResponse } from "@/lib/options/chain-response";

// The option chain for the Options Lab and its contract picker: from the user's own broker when it
// gives one, the licensed feed for allowed accounts, otherwise free-trial estimates. Every IV and
// Greek says whether the source provided it or we calculated / estimated it. Filtered and paged on
// the server, so the browser gets only the strikes it shows.

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await enforceRateLimit(`option-chain:${userId}`, 40, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }
  return chainResponse(userId, request.nextUrl.searchParams);
}
