import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

// Scheduled work records each run, so the admin portal can show whether the
// jobs are healthy (and when they last ran) without opening AWS.

export const JOBS = {
  "paper-sync": { label: "Forward test sync", schedule: "Every 5 min, Mon–Fri 09:15–15:45 IST", rule: "myalgoagent-paper-sync" },
  "purge-deleted-accounts": { label: "Account deletion purge", schedule: "Daily", rule: "myalgoagent-purge-deleted-accounts" },
} as const;
export type JobName = keyof typeof JOBS;

/** Runs `fn` and records the run (start, finish, outcome, its summary). Rethrows failures. */
export async function recordJob<T extends Prisma.InputJsonValue>(job: JobName, fn: () => Promise<T>): Promise<T> {
  const run = await prisma.jobRun.create({ data: { job } }).catch((err) => {
    logError("jobs.record", err, { job });
    return null;
  });
  try {
    const summary = await fn();
    if (run) await prisma.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, summary } }).catch(() => {});
    return summary;
  } catch (err) {
    if (run) {
      await prisma.jobRun
        .update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: err instanceof Error ? err.message.slice(0, 1000) : String(err) } })
        .catch(() => {});
    }
    throw err;
  }
}

/**
 * A value computed at most once per `ttlMs` across all server instances,
 * stored as a JobRun row ("cache:<key>"). For slow or paid lookups such as
 * AWS Cost Explorer ($0.01 a call).
 */
export async function cached<T extends Prisma.InputJsonValue>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<{ value: T; at: Date }> {
  const job = `cache:${key}`;
  if (!opts.refresh) {
    const hit = await prisma.jobRun.findFirst({
      where: { job, ok: true, startedAt: { gte: new Date(Date.now() - ttlMs) } },
      orderBy: { startedAt: "desc" },
    });
    if (hit?.summary !== undefined && hit.summary !== null) return { value: hit.summary as T, at: hit.startedAt };
  }
  const value = await fn();
  const row = await prisma.jobRun.create({ data: { job, finishedAt: new Date(), ok: true, summary: value } }).catch(() => null);
  return { value, at: row?.startedAt ?? new Date() };
}

/** Keeps the run history short: drops runs older than `days`. */
export async function pruneJobRuns(days = 30): Promise<number> {
  const { count } = await prisma.jobRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return count;
}
