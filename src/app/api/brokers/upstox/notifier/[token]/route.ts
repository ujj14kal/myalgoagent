import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/request-ip";
import { upstoxProfile } from "@/lib/brokers/adapters";
import { credsOf, notifierTokenHash, PHONE_WINDOW_MS, saveError, saveSession } from "@/lib/brokers/service";

// Upstox's notifier webhook: after the user taps Approve in the Upstox app /
// on WhatsApp, Upstox POSTs the day's access token here. Upstox doesn't sign
// these calls, so a token is only accepted when all of this holds:
//  - the path is this user's private notifier token (we store only its hash),
//  - that user asked for an approval in the last few hours and it's still open,
//  - the payload's client_id is that user's own API key,
//  - Upstox itself accepts the token (we fetch the profile with it).
// Always answers 200 so Upstox doesn't retry; the outcome shows in the app.

export const dynamic = "force-dynamic";

const ok = (note: string) => NextResponse.json({ status: "ok", note });

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await enforceRateLimit(`upstox-notifier:${clientIpFrom((n) => req.headers.get(n))}`, 60, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ status: "error" }, { status: 429 });
    throw err;
  }
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return ok("ignored");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return ok("ignored");
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (body.message_type !== "access_token" || !accessToken || !clientId) return ok("ignored");

  try {
    const row = await prisma.brokerConnection.findUnique({ where: { notifierTokenHash: notifierTokenHash(token) } });
    const pending = row?.broker === "upstox" && row.loginMethod === "phone" && row.pendingState?.startsWith("phone:") && row.pendingStartedAt && Date.now() - row.pendingStartedAt.getTime() <= PHONE_WINDOW_MS;
    if (!row || !pending) {
      logWarn("broker.upstox-notifier", "Token for no open approval", { known: !!row });
      return ok("no open approval");
    }
    if (!same(clientId, credsOf(row).apiKey)) {
      logWarn("broker.upstox-notifier", "client_id doesn't match the saved key", { connection: row.id });
      return ok("ignored");
    }
    let profile;
    try {
      profile = await upstoxProfile(accessToken);
    } catch (err) {
      await saveError(row.id, err);
      return ok("token rejected");
    }
    const expiresMs = Number(body.expires_at);
    const expiresAt = Number.isFinite(expiresMs) && expiresMs > Date.now() ? new Date(expiresMs) : new Date(Date.now() + 12 * 3_600_000);
    await saveSession(row, { accessToken, expiresAt, accountName: profile.accountName, brokerClientId: profile.brokerClientId });
    return ok("connected");
  } catch (err) {
    logError("broker.upstox-notifier", err);
    return ok("error");
  }
}
