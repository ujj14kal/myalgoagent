import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketDataFor, marketExtrasFor, maxPain, pcr } from "@/lib/market-data";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// Live option chain (with IV and Greeks) for the Options Lab — licensed-feed accounts only.

/** Option underlyings → the instrument whose price is the spot. */
const SPOT: Record<string, string> = { NIFTY: "^NSEI", BANKNIFTY: "^NSEBANK" };
const spotSymbol = (u: string) => SPOT[u] ?? `${u}.NS`;

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const extras = marketExtrasFor(userId);
  if (!extras) return NextResponse.json({ live: false });
  try {
    await enforceRateLimit(`option-chain:${userId}`, 40, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  const underlying = (request.nextUrl.searchParams.get("underlying") ?? "NIFTY").toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(underlying)) return NextResponse.json({ error: "Invalid underlying" }, { status: 400 });

  try {
    const expiries = await extras.expiries(underlying);
    if (expiries.length === 0) return NextResponse.json({ error: `${underlying} has no listed options.` }, { status: 404 });
    const asked = request.nextUrl.searchParams.get("expiry");
    const expiry = asked && expiries.includes(asked) ? asked : expiries[0];
    const market = marketDataFor(userId, "view");
    const [rows, lotSize, ticks] = await Promise.all([
      extras.optionChain(underlying, expiry),
      extras.lotSize(underlying).catch(() => null),
      market.getRecentTicks?.(spotSymbol(underlying), 1).catch(() => []) ?? [],
    ]);
    // Days left until 15:30 IST on expiry day.
    const expiryAt = Date.parse(`${expiry}T15:30:00+05:30`);
    const daysToExpiry = Math.max((expiryAt - Date.now()) / 86_400_000, 0);
    return NextResponse.json(
      { live: true, underlying, expiries, expiry, daysToExpiry, lotSize, spot: ticks.at(-1)?.price ?? null, spotAt: ticks.at(-1)?.time ?? null, pcr: pcr(rows), maxPain: maxPain(rows), rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("api/options/chain", error, { underlying });
    return NextResponse.json({ error: "Couldn't load the option chain — try again in a moment." }, { status: 502 });
  }
}
