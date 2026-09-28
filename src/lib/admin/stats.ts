import "server-only";
import { prisma } from "@/lib/prisma";

// Numbers for the admin overview. Timestamps are stored in UTC; days are
// bucketed in IST so "today" means the Indian trading day.

const DAY = 86_400_000;
const since = (days: number) => new Date(Date.now() - days * DAY);

/** Rows per IST day for the last `days` days (zero-filled), oldest first. */
// Table and column names come only from this file (never from input), so building the SQL text is safe.
async function perDay(table: "User" | "BacktestRun" | "AgentMessage" | "SupportCase", column: "createdAt", days: number) {
  const rows = await prisma.$queryRawUnsafe<{ d: Date; n: bigint }[]>(
    `SELECT (("${column}" + interval '5 hours 30 minutes')::date) AS d, count(*) AS n FROM "${table}" WHERE "${column}" >= $1 GROUP BY 1 ORDER BY 1`,
    since(days),
  );
  const map = new Map(rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), Number(r.n)]));
  const out: { label: string; value: number }[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(Date.now() + 330 * 60_000 - k * DAY).toISOString().slice(0, 10);
    out.push({ label: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }), value: map.get(d) ?? 0 });
  }
  return out;
}

export async function overviewStats() {
  const [
    users,
    new7,
    new30,
    active1,
    active7,
    suspended,
    pendingDeletion,
    nextDeletion,
    openCases,
    openFeedback,
    oldestOpenCase,
    oldestOpenFeedback,
    activePaper,
    strategies,
    backtests7,
    brokers,
    brokerErrors,
    agentMsgs7,
    ratings30,
    signups,
    agentDaily,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
    prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: since(1) } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: since(7) } } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { status: "PENDING_DELETION" } }),
    prisma.user.findFirst({ where: { status: "PENDING_DELETION" }, orderBy: { deletionScheduledFor: "asc" }, select: { deletionScheduledFor: true } }),
    prisma.supportCase.count({ where: { status: "OPEN" } }),
    prisma.feedback.count({ where: { status: "OPEN" } }),
    prisma.supportCase.findFirst({ where: { status: "OPEN" }, orderBy: { lastActivityAt: "asc" }, select: { lastActivityAt: true } }),
    prisma.feedback.findFirst({ where: { status: "OPEN" }, orderBy: { lastActivityAt: "asc" }, select: { lastActivityAt: true } }),
    prisma.paperSession.count({ where: { status: "ACTIVE" } }),
    prisma.strategy.count(),
    prisma.backtestRun.count({ where: { createdAt: { gte: since(7) } } }),
    prisma.brokerConnection.groupBy({ by: ["broker", "status"], _count: true }),
    prisma.brokerConnection.count({ where: { status: "ERROR" } }),
    prisma.agentMessage.count({ where: { role: "USER", createdAt: { gte: since(7) } } }),
    prisma.agentMessage.groupBy({ by: ["rating"], where: { rating: { not: null }, createdAt: { gte: since(30) } }, _count: true }),
    perDay("User", "createdAt", 30),
    perDay("AgentMessage", "createdAt", 14),
  ]);

  const oldestOpen = [oldestOpenCase?.lastActivityAt, oldestOpenFeedback?.lastActivityAt].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const byBroker = new Map<string, { connected: number; total: number }>();
  for (const b of brokers) {
    const e = byBroker.get(b.broker) ?? { connected: 0, total: 0 };
    e.total += b._count;
    if (b.status === "CONNECTED") e.connected += b._count;
    byBroker.set(b.broker, e);
  }
  return {
    users: { total: users, new7, new30, active1, active7, suspended, pendingDeletion, nextDeletion: nextDeletion?.deletionScheduledFor ?? null, signups },
    inbox: { openCases, openFeedback, oldestOpen },
    trading: { activePaper, strategies, backtests7 },
    brokers: { byBroker: [...byBroker.entries()].map(([broker, v]) => ({ broker, ...v })).sort((a, b) => b.total - a.total), errors: brokerErrors },
    ai: { messages7: agentMsgs7, up: ratings30.find((r) => r.rating === 1)?._count ?? 0, down: ratings30.find((r) => r.rating === -1)?._count ?? 0, daily: agentDaily },
  };
}

export { perDay };
