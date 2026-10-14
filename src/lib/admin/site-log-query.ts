import type { Prisma } from "@prisma/client";

// Reads the Logs page's address into a database query. Pure, so it's unit-tested.

export const TABS = ["errors", "signins", "warnings", "server", "outages"] as const;
export type LogTab = (typeof TABS)[number];
export const RANGES = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 } as const;
export type LogRange = keyof typeof RANGES;

export type LogFilters = { tab: LogTab; range: LogRange; hours: number; q: string; user: string; source: string; page: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseLogFilters(sp: Record<string, string | string[] | undefined>): LogFilters {
  const tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as LogTab) : "errors";
  const range = one(sp.range) in RANGES ? (one(sp.range) as LogRange) : "24h";
  return {
    tab,
    range,
    hours: RANGES[range],
    q: one(sp.q).trim().slice(0, 100),
    user: one(sp.user).trim().slice(0, 80),
    source: ["web", "engine", "browser"].includes(one(sp.source)) ? one(sp.source) : "",
    page: Math.max(1, Math.floor(Number(one(sp.page))) || 1),
  };
}

const KINDS: Record<"errors" | "signins" | "warnings", string[]> = {
  errors: ["server_error", "client_error", "engine_error"],
  signins: ["sign_in", "sign_in_failed"],
  warnings: ["warning"],
};

/** The rows a tab shows. `userId` is the account the `user` filter resolved to (null when it matched none). */
export function siteEventWhere(f: LogFilters, userId: string | null, now = new Date()): Prisma.SiteEventWhereInput {
  const kinds = f.tab === "errors" || f.tab === "signins" || f.tab === "warnings" ? KINDS[f.tab] : KINDS.errors;
  return {
    kind: { in: kinds },
    at: { gte: new Date(now.getTime() - f.hours * 3_600_000) },
    ...(f.source ? { source: f.source } : {}),
    ...(f.user ? { userId: userId ?? "no-such-user" } : {}),
    ...(f.q ? { OR: [{ message: { contains: f.q, mode: "insensitive" } }, { context: { contains: f.q, mode: "insensitive" } }, { path: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
}

/** Whole hours from `from` to `to`, newest last, for the bar chart. */
export function hourBuckets(rows: { at: Date; count: number }[], hours: number, now = new Date()): { label: string; value: number }[] {
  const end = Math.floor(now.getTime() / 3_600_000);
  const buckets = new Map<number, number>();
  for (const r of rows) {
    const h = Math.floor(r.at.getTime() / 3_600_000);
    if (h > end - hours && h <= end) buckets.set(h, (buckets.get(h) ?? 0) + r.count);
  }
  return Array.from({ length: hours }, (_, i) => {
    const h = end - hours + 1 + i;
    return { label: new Date(h * 3_600_000).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true, timeZone: "Asia/Kolkata" }), value: buckets.get(h) ?? 0 };
  });
}
