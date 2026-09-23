import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/session-cookie";
import { reactivateIfPending } from "@/lib/account-status";
import { logError } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase();
  const failUrl = new URL("/login?error=invalid-link", req.url);
  if (!token || !email) return NextResponse.redirect(failUrl);

  try {
    // Unauthenticated and DB-backed on every hit, so metered per client IP.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await enforceRateLimit(`magic-link-verify:${ip}`, 20, 60_000);

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await prisma.verificationToken.findUnique({
      where: { identifier_token: { identifier: email, token: tokenHash } },
    });
    if (!record || record.expires < new Date()) return NextResponse.redirect(failUrl);

    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: tokenHash } },
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.redirect(failUrl);

    await reactivateIfPending(user.id);
    await createSessionForUser(user.id);
    return NextResponse.redirect(new URL("/app/dashboard", req.url));
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.redirect(new URL("/login?error=Configuration", req.url));
    // A transient DB/infra failure must land the person on a readable login
    // page, not a raw 500 — and must not be reported as "invalid link",
    // since the link itself may be perfectly fine.
    logError("api/auth/magic-link", err);
    return NextResponse.redirect(new URL("/login?error=Configuration", req.url));
  }
}
