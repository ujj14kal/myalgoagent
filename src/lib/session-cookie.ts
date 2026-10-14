import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { recordSignIn, type SignInMethod } from "@/lib/sign-in-log";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Auth.js default

/**
 * Creates a database Session row and sets Auth.js's own session cookie
 * directly. Used by flows (passkey login) that verify identity themselves
 * outside Auth.js's provider callback, so there's no separate custom
 * Credentials provider to keep in sync with the real verification logic.
 */
export async function createSessionForUser(userId: string, method: SignInMethod = "password"): Promise<void> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  // One active sign-in per account: signing in here ends any session this account has on another browser or device.
  await prisma.$transaction([prisma.session.deleteMany({ where: { userId } }), prisma.session.create({ data: { sessionToken, userId, expires } })]);

  await recordSignIn(userId, method);

  const useSecureCookies = process.env.NODE_ENV === "production";
  const cookieName = useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token";
  const cookieStore = await cookies();
  cookieStore.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies,
    expires,
  });
}
