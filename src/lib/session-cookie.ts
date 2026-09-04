import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Auth.js default

/**
 * Creates a database Session row and sets Auth.js's own session cookie
 * directly. Used by flows (passkey login) that verify identity themselves
 * outside Auth.js's provider callback, so there's no separate custom
 * Credentials provider to keep in sync with the real verification logic.
 */
export async function createSessionForUser(userId: string): Promise<void> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await prisma.session.create({ data: { sessionToken, userId, expires } });

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
