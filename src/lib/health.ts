import { prisma } from "@/lib/prisma";

export type HealthSeverity = "CRITICAL" | "WARNING";

export interface HealthAlert {
  id: string;
  severity: HealthSeverity;
  title: string;
  description: string;
  // Present only when there's a real, confirmable action to take right
  // from the panel — otherwise it's advisory (e.g. "review your risk
  // settings"), pointed at wherever that's actually configured instead.
  action?:
    | { kind: "stop-session"; sessionId: string; label: string }
    | { kind: "stop-duplicate-sessions"; strategyId: string; keepSessionId: string; count: number; label: string }
    | { kind: "link"; href: string; label: string };
}

const STALE_SYNC_DAYS = 5;

/** Computes real, live health alerts from the account's own data — nothing
 * here is simulated or hardcoded. Each check is a genuine condition this
 * session's audit work found worth surfacing: an orphaned session with no
 * strategy to trace it back to, more than one live session redundantly
 * running the same strategy at once, a kill switch currently blocking
 * every new entry, or a live session that's gone quiet. */
export async function getHealthAlerts(userId: string): Promise<HealthAlert[]> {
  const alerts: HealthAlert[] = [];

  const [riskSettings, liveSessions, recentRiskEvents] = await Promise.all([
    prisma.riskSettings.findUnique({ where: { userId } }),
    prisma.paperSession.findMany({
      where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.riskEvent.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  if (riskSettings?.killSwitchEnabled) {
    alerts.push({
      id: "kill-switch",
      severity: "CRITICAL",
      title: "Kill switch is on",
      description: "Every strategy is blocked from opening new positions until you turn this off in Risk Controls.",
      action: { kind: "link", href: "/app/risk-controls", label: "Review Risk Controls" },
    });
  }

  for (const event of recentRiskEvents) {
    if (event.type === "KILL_SWITCH_BLOCKED") continue; // redundant with the kill-switch alert above
    alerts.push({
      id: `risk-event-${event.id}`,
      severity: "CRITICAL",
      title: event.type === "MAX_LOSS_HIT" ? "Max loss limit was hit" : "Max consecutive losses was hit",
      description: event.message,
      action: { kind: "link", href: "/app/risk-controls", label: "Review Risk Controls" },
    });
  }

  const orphaned = liveSessions.filter((s) => s.strategyId === null);
  for (const s of orphaned) {
    alerts.push({
      id: `orphaned-${s.id}`,
      severity: "CRITICAL",
      title: `"${s.strategyName}" has no strategy behind it`,
      description: "Its strategy was deleted, but this paper session is still live and syncing. Stop it to move it to history.",
      action: { kind: "stop-session", sessionId: s.id, label: "Stop session" },
    });
  }

  const byStrategy = new Map<string, typeof liveSessions>();
  for (const s of liveSessions) {
    if (!s.strategyId) continue;
    const list = byStrategy.get(s.strategyId) ?? [];
    list.push(s);
    byStrategy.set(s.strategyId, list);
  }
  for (const [strategyId, group] of byStrategy) {
    if (group.length <= 1) continue;
    // orderBy createdAt desc above, so the first is the most recent.
    const [keep, ...redundant] = group;
    alerts.push({
      id: `duplicate-${strategyId}`,
      severity: "WARNING",
      title: `${group.length} live sessions running "${keep.strategyName}" at once`,
      description: `Only one of these needs to be live — the other ${redundant.length === 1 ? "one is" : `${redundant.length} are`} redundant and will confuse your P&L. Keeps the most recently started, stops the rest.`,
      action: {
        kind: "stop-duplicate-sessions",
        strategyId,
        keepSessionId: keep.id,
        count: redundant.length,
        label: `Stop ${redundant.length} redundant session${redundant.length === 1 ? "" : "s"}`,
      },
    });
  }

  const staleSince = Date.now() / 1000 - STALE_SYNC_DAYS * 24 * 60 * 60;
  for (const s of liveSessions) {
    if (s.status !== "ACTIVE" || !s.strategyId) continue; // orphans already covered above
    if (s.lastSyncedTime !== null && s.lastSyncedTime >= staleSince) continue;
    alerts.push({
      id: `stale-${s.id}`,
      severity: "WARNING",
      title: `"${s.strategyName}" hasn't synced in over ${STALE_SYNC_DAYS} days`,
      description: "It's still marked Active but may be missing real signals. Open it and sync now to catch it up.",
      action: { kind: "link", href: `/app/paper-trading/${s.id}`, label: "Open session" },
    });
  }

  const severityOrder: Record<HealthSeverity, number> = { CRITICAL: 0, WARNING: 1 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
