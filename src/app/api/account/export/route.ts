import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, watchlistItems, strategies, backtestRuns, paperSessions, riskSettings, riskEvents, notifications, feedback, supportCases] =
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
      prisma.feedback.findMany({ where: { userId } }),
      prisma.supportCase.findMany({ where: { userId } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const exportData = {
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
  };

  const filename = `myalgoagent-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
