import "server-only";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/request-ip";
import { recordSiteEvent } from "@/lib/site-log";

// Who came in, how and from where, and who tried and failed: the team's first stop when a customer says "I can't get in".
// Never throws and never stores a password, a code or a token.

export type SignInMethod = "password" | "google" | "magic_link" | "passkey" | "signup";

async function who() {
  try {
    const h = await headers();
    return { ip: clientIpFrom((n) => h.get(n)), userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function recordSignIn(userId: string, method: SignInMethod): Promise<void> {
  const w = await who();
  await recordSiteEvent({ kind: "sign_in", level: "info", source: "web", context: `sign-in.${method}`, message: `Signed in with ${method.replace("_", " ")}`, userId, ...w });
}

/** A failed attempt. `identifier` is what was typed (a username or email), never the password; `userId` is set when it matched an account. */
export async function recordSignInFailure(method: SignInMethod, reason: string, identifier: string, userId?: string | null): Promise<void> {
  const w = await who();
  await recordSiteEvent({ kind: "sign_in_failed", level: "warn", source: "web", context: `sign-in.${method}`, message: reason, userId: userId ?? null, detail: { identifier: identifier.slice(0, 80) }, ...w });
}
