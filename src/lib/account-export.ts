import "server-only";
import { prisma } from "@/lib/prisma";

/** Everything an account owns, for the user's own data export (and staff fulfilling a data request). Never includes broker keys or tokens. */
export async function collectUserData(userId: string) {
  const [user, watchlistItems, strategies, backtestRuns, paperSessions, riskSettings, riskEvents, notifications, feedback, supportCases, agentConversations, brokerConnections, workspaces] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          phone: true,
          agentName: true,
          createdAt: true,
        },
      }),
      prisma.watchlistItem.findMany({ where: { userId }, include: { instrument: true } }),
      prisma.strategy.findMany({ where: { userId }, include: { instrument: true } }),
      prisma.backtestRun.findMany({ where: { userId }, include: { trades: true } }),
      prisma.paperSession.findMany({ where: { userId }, include: { orders: true } }),
      prisma.riskSettings.findUnique({ where: { userId } }),
      prisma.riskEvent.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.feedback.findMany({ where: { userId }, include: { messages: { where: { author: { not: "NOTE" } }, select: { author: true, authorName: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.supportCase.findMany({ where: { userId }, include: { messages: { where: { author: { not: "NOTE" } }, select: { author: true, authorName: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } } } }),
      prisma.agentConversation.findMany({
        where: { userId },
        include: { messages: { select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
      }),
      // Which brokers are linked — never the encrypted keys or tokens themselves.
      prisma.brokerConnection.findMany({
        where: { userId },
        select: { broker: true, status: true, apiKeyHint: true, brokerClientId: true, accountName: true, connectedAt: true, tokenExpiresAt: true, lastCheckedAt: true, createdAt: true },
      }),
      prisma.workspace.findMany({ where: { userId }, include: { versions: { orderBy: { version: "asc" } } } }),
    ]);

  if (!user) return null;

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    watchlistItems,
    strategies,
    backtestRuns,
    paperSessions,
    riskSettings,
    riskEvents,
    notifications,
    feedback,
    supportCases,
    agentConversations,
    brokerConnections,
    workspaces,
  };
}
