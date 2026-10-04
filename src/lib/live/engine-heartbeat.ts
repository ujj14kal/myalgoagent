import "server-only";
import { prisma } from "@/lib/prisma";

// The always-on engine (AWS Fargate) records a heartbeat each pass. The cheap backup that runs on
// Amplify every minute looks at it: while the engine is alive the backup stays out of the way, and
// the moment the engine stops the backup takes over — no switch to flip. One JobRun row, updated in place.

const JOB = "engine:live";
/** The engine counts as alive if it reported this recently (it reports every ~15 s). */
export const ENGINE_ALIVE_MS = 60_000;

export async function recordEngineBeat(summary: { total: number; acted: number; failed: number }) {
  const row = await prisma.jobRun.findFirst({ where: { job: JOB }, select: { id: true } });
  const data = { finishedAt: new Date(), ok: true, summary };
  if (row) await prisma.jobRun.update({ where: { id: row.id }, data });
  else await prisma.jobRun.create({ data: { job: JOB, ...data } });
}

export async function engineAlive(maxAgeMs = ENGINE_ALIVE_MS): Promise<boolean> {
  const row = await prisma.jobRun.findFirst({ where: { job: JOB }, select: { finishedAt: true } });
  return !!row?.finishedAt && Date.now() - row.finishedAt.getTime() < maxAgeMs;
}
