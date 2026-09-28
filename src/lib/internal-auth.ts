import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs (EventBridge API destinations) authenticate with a shared
 * secret header. Constant-time comparison, and a missing secret never matches.
 */
export function internalSecretMatches(provided: string | null, expected: string | undefined = process.env.PURGE_SECRET): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
