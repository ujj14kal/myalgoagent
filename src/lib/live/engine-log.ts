import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { plainReason } from "./plain-reason";

// The engine's activity log: one line per thing it did or decided, in plain English, with a
// timestamp. Shown live on the Live Trading page. Writing a line must never get in the way of
// trading, so it never throws and never waits on anything else.

export type LogLevel = "INFO" | "OK" | "WARN" | "ERROR";

export async function liveLog(userId: string, deploymentId: string | null, level: LogLevel, message: string, detail?: Prisma.InputJsonValue) {
  try {
    await prisma.liveEngineLog.create({ data: { userId, deploymentId, level, message: message.slice(0, 600), ...(detail !== undefined ? { detail } : {}) } });
  } catch (err) {
    logError("live.engine-log", err, { userId, deploymentId });
  }
}

const recent = new Map<string, { at: number; text: string }>();
/** A line that repeats ("still waiting…") is written at most once per `everyMs`, and at once when its text changes. */
export async function liveLogThrottled(key: string, everyMs: number, userId: string, deploymentId: string | null, level: LogLevel, message: string, detail?: Prisma.InputJsonValue) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && last.text === message && now - last.at < everyMs) return;
  recent.set(key, { at: now, text: message });
  if (recent.size > 2000) recent.clear();
  await liveLog(userId, deploymentId, level, message, detail);
}

/** One line per user with a running strategy when the market opens or closes, and when the engine (re)starts. */
export async function logForActiveUsers(level: LogLevel, message: string) {
  try {
    const rows = await prisma.liveDeployment.findMany({ where: { status: "ACTIVE" }, select: { userId: true }, distinct: ["userId"] });
    for (const r of rows) await liveLog(r.userId, null, level, message);
  } catch (err) {
    logError("live.engine-log.all", err);
  }
}

/** Keeps the log short: drops lines older than `days`. */
export async function pruneEngineLog(days = 14): Promise<number> {
  const { count } = await prisma.liveEngineLog.deleteMany({ where: { at: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return count;
}

export { plainReason };
