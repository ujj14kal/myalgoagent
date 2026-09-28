import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { callbackOrigin, liveAdapter } from "@/lib/brokers/service";

// The URL users paste into their broker app ("Redirect URL"). After the user
// logs in at the broker (password + 2FA happen there, never here), the broker
// sends their browser back here with a one-time code. We hand it straight to
// the connecting screen, which shows progress while completeBrokerLogin
// exchanges the code — and a clear success or failure when it's done.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ broker: string }> }) {
  const { broker } = await params;
  const live = liveAdapter(broker);
  if (!live) return NextResponse.json({ error: "Unknown broker" }, { status: 404 });

  // Built from the public origin: request.url reflects Amplify's internal listener.
  const origin = callbackOrigin();
  let session;
  try {
    session = await auth();
  } catch (err) {
    // Can't tell who this is (e.g. a brief database outage): send them back to
    // Broker Connections to retry rather than showing a bare error page.
    logError("broker.callback:auth", err, { broker: live.info.id });
    return NextResponse.redirect(new URL(`/app/broker-connections?broker=${live.info.id}`, origin), 303);
  }
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login?callbackUrl=%2Fapp%2Fbroker-connections%3Fresult%3Dsigned_out", origin), 303);
  }

  const target = new URL(`/app/broker-connections/connecting/${live.info.id}`, origin);
  for (const [k, v] of request.nextUrl.searchParams) target.searchParams.append(k, v);
  const res = NextResponse.redirect(target, 303);
  // The one-time code is in this URL — keep it out of any Referer header.
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
