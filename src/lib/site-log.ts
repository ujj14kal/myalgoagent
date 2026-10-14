import { prisma } from "@/lib/prisma";

// The site's own event log, in the database, so the team can search it from the admin portal: errors the server and the
// browser hit, and sign-ins. Everything here is best effort and can never throw: logging must not be what breaks a page.
// Repeats are folded: the same error in the same minute is one row with a count, so one bad deploy can't flood the table.

export type SiteEventKind = "server_error" | "client_error" | "engine_error" | "warning" | "sign_in" | "sign_in_failed";

export type SiteEventInput = {
  kind: SiteEventKind;
  level: "error" | "warn" | "info";
  source: "web" | "engine" | "browser";
  context: string;
  message: string;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  digest?: string | null;
  detail?: Record<string, unknown> | null;
};

const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);
const MAX_PER_MINUTE = 120;
const recent = new Map<string, { row: Promise<string | null>; at: number }>();
let windowStart = 0;
let windowCount = 0;

/** Keys that never go into the log, whatever a caller passes. */
const SECRET = /pass(word)?|secret|token|authorization|cookie|api.?key|pin|otp/i;
function clean(detail: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!detail) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SECRET.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, 4000) : v;
  }
  const json = JSON.stringify(out);
  return json.length > 12_000 ? { truncated: json.slice(0, 12_000) } : out;
}

export async function recordSiteEvent(e: SiteEventInput): Promise<void> {
  // Nothing in here logs a failure (it would loop back into this function), and a hard cap per minute keeps a storm from filling the table.
  if (!process.env.DATABASE_URL) return;
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_PER_MINUTE) return;
  const key = `${e.kind}|${e.context}|${e.message.slice(0, 120)}|${e.userId ?? ""}`;
  const prior = recent.get(key);
  if (recent.size > 500) recent.clear();
  try {
    if (prior && now - prior.at < 60_000) {
      const id = await prior.row;
      if (id) {
        await prisma.siteEvent.update({ where: { id }, data: { count: { increment: 1 } } });
        return;
      }
    }
    windowCount++;
    const row = prisma.siteEvent
      .create({
        data: {
          kind: e.kind,
          level: e.level,
          source: e.source,
          context: clip(e.context, 120) ?? "unknown",
          message: clip(e.message, 1000) ?? "",
          path: clip(e.path, 300),
          method: clip(e.method, 10),
          userId: clip(e.userId, 60),
          userAgent: clip(e.userAgent, 300),
          ip: clip(e.ip, 64),
          digest: clip(e.digest, 80),
          detail: (clean(e.detail) ?? undefined) as never,
        },
        select: { id: true },
      })
      .then((r) => r.id)
      .catch(() => null);
    recent.set(key, { row, at: now });
    await row;
  } catch {
    /* logging must never break the caller */
  }
}

/** The user a session cookie belongs to, for errors raised where there is no signed-in context (a request error hook). */
export async function userFromCookieHeader(cookie: string | null | undefined): Promise<string | null> {
  if (!cookie) return null;
  const m = /(?:^|;\s*)(?:__Secure-)?authjs\.session-token=([^;]+)/.exec(cookie);
  if (!m) return null;
  try {
    const s = await prisma.session.findUnique({ where: { sessionToken: decodeURIComponent(m[1]) }, select: { userId: true } });
    return s?.userId ?? null;
  } catch {
    return null;
  }
}

export const RETENTION_DAYS = 90;

/** Drops events older than the retention window. */
export async function pruneSiteEvents(days = RETENTION_DAYS): Promise<number> {
  const { count } = await prisma.siteEvent.deleteMany({ where: { at: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return count;
}
