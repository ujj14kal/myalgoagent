import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/session-cookie";
import { reactivateIfPending } from "@/lib/account-status";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase();
  const failUrl = new URL("/login?error=invalid-link", req.url);
  if (!token || !email) return NextResponse.redirect(failUrl);

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
}
