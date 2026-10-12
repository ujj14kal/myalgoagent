import { NextResponse, type NextRequest } from "next/server";
import { confirmEmail } from "@/lib/email-verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { siteUrl } from "@/lib/site";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const go = (ok: boolean) => NextResponse.redirect(`${siteUrl}/app?emailConfirmed=${ok ? "1" : "0"}`, 303);
  if (!email || !/^[a-f0-9]{64}$/.test(token)) return go(false);
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (await checkRateLimit(`verify-email:${ip}`, 20, 60_000)) return go(false);
    return go(await confirmEmail(email, token));
  } catch (err) {
    logError("verify-email", err, {});
    return go(false);
  }
}
