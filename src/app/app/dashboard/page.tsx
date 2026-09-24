import Link from "next/link";
import { Activity, Braces, FlaskConical, Layers, LineChart, PieChart, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPaperSessionRows,
  summarizePortfolio,
  getEquityCurve,
  getPnlByPeriod,
  getRecentActivity,
  getStrategyPerformance,
  getRecentBacktests,
} from "@/lib/portfolio";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import { getHealthAlerts } from "@/lib/health";
import { formatINR, formatPct, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";
import type { AgentPose } from "@/components/robot/agent-2d";
import EquityCurveChart from "@/components/equity-curve-chart";
import HealthPanel from "@/components/health-panel";
import AgentBriefing, { type BriefingLine } from "@/components/dashboard/agent-briefing";
import PnlSummary from "@/components/dashboard/pnl-summary";
import AllocationDonut from "@/components/dashboard/allocation-donut";
import RiskGauge from "@/components/dashboard/risk-gauge";
import StrategyPerformanceList from "@/components/dashboard/strategy-performance-list";
import ActivityFeed from "@/components/dashboard/activity-feed";
import WatchlistSnippet from "@/components/dashboard/watchlist-snippet";
import DashboardEmptyState from "@/components/dashboard/dashboard-empty-state";
import RecentBacktests from "@/components/dashboard/recent-backtests";
import QuickActions from "@/components/dashboard/quick-actions";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Dashboard", robots: { index: false } };

function greetingFor(date: Date) {
  const hour = Number(date.toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [user, rows, riskSettings, pnl, activity, strategies, watchlistItems, strategyCount, recentBacktests, healthAlerts] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { agentName: true } }),
      getPaperSessionRows(userId),
      prisma.riskSettings.findUnique({ where: { userId } }),
      getPnlByPeriod(userId),
      getRecentActivity(userId),
      getStrategyPerformance(userId),
      prisma.watchlistItem.findMany({
        where: { userId },
        include: { instrument: { select: { symbol: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.strategy.count({ where: { userId, status: { not: "DELETED" } } }),
      getRecentBacktests(userId),
      getHealthAlerts(userId),
    ]);

  const agentName = user?.agentName ?? DEFAULT_AGENT_NAME;
  const summary = summarizePortfolio(rows);
  const equityCurve = await getEquityCurve(userId, summary.totalStarting || 100000);
  const todayPnlPct = summary.totalStarting > 0 ? (pnl.today / summary.totalStarting) * 100 : 0;

  const allocationSlices = rows
    .filter((r) => r.positionValue > 0)
    .map((r) => ({ label: r.session.instrumentSymbol, value: r.positionValue }));

  const isNewAccount = strategyCount === 0;
  const liveCount = rows.filter((r) => r.session.status === "ACTIVE").length;
  const openPositions = rows.filter((r) => r.session.positionQuantity !== null).length;
  const critical = healthAlerts.filter((a) => a.severity === "CRITICAL").length;
  const warnings = healthAlerts.length - critical;
  const totalTone = toneOf(summary.totalPnlPct);

  // The agent's pose follows the account's real state.
  const pose: AgentPose = riskSettings?.killSwitchEnabled || critical > 0
    ? "alert"
    : isNewAccount
    ? "wave"
    : liveCount > 0
    ? "analyzing"
    : "idle";

  const firstName = (session.user.name ?? "").split(/\s+/)[0] || "there";
  const lines: BriefingLine[] = isNewAccount
    ? [
        { text: "Your workspace is ready — no strategies yet." },
        { text: "Build one, backtest it on real history, then paper trade it before any real money is involved." },
      ]
    : [
        riskSettings?.killSwitchEnabled
          ? { text: "The kill switch is ON — no session can open a new position.", tone: "bad" }
          : { text: `${liveCount} live paper session${liveCount === 1 ? "" : "s"}, ${openPositions} open position${openPositions === 1 ? "" : "s"}.`, tone: liveCount > 0 ? "good" : "neutral" },
        {
          text: `Paper portfolio ${formatINR(summary.totalEquity)} (${formatPct(summary.totalPnlPct)} overall) · today ${formatSignedINR(pnl.today)} realised.`,
          tone: totalTone === "up" ? "good" : totalTone === "down" ? "bad" : "neutral",
        },
        critical + warnings > 0
          ? { text: `${critical + warnings} item${critical + warnings === 1 ? "" : "s"} need${critical + warnings === 1 ? "s" : ""} your attention in Health below.`, tone: critical > 0 ? "bad" : "warn" }
          : { text: "No risk, redundancy or sync issues found.", tone: "good" },
        ...(riskSettings?.maxLossPercent == null
          ? [{ text: "No max-loss limit is set yet — you can add one in Risk Controls.", tone: "warn" as const }]
          : []),
      ];

  return (
    <div className="space-y-6">
      <AgentBriefing
        agentName={agentName}
        greeting={`${greetingFor(new Date())}, ${firstName}`}
        pose={pose}
        lines={lines}
        primaryAction={isNewAccount ? { href: "/app/strategies/new", label: "Create your first strategy" } : { href: "/app/paper-trading", label: "Open paper trading" }}
        secondaryAction={isNewAccount ? { href: "/app/instruments", label: "Browse market data" } : { href: "/app/strategies/new", label: "New strategy" }}
      />

      {isNewAccount && <DashboardEmptyState agentName={agentName} />}

      <PnlSummary pnl={pnl} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div data-tour="portfolio-chart">
            <CardHeader
              title="Portfolio value"
              subtitle="Paper trading, all sessions combined"
              icon={LineChart}
              action={
                <div className="text-right">
                  <p className="num text-lg font-bold text-brand-navy">{formatINR(summary.totalEquity)}</p>
                  <p className={`num text-xs font-semibold ${TONE_TEXT[totalTone]}`}>{formatPct(summary.totalPnlPct)}</p>
                </div>
              }
            />
            <div className="mt-4">
              <EquityCurveChart points={equityCurve} />
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <HealthPanel alerts={healthAlerts} />
          <Card className="p-5">
            <CardHeader title="Risk exposure" icon={ShieldCheck} action={<Link href="/app/risk-controls" className="text-xs font-semibold text-brand-primary hover:underline">Manage</Link>} />
            <div className="mt-4">
              <RiskGauge
                killSwitchEnabled={riskSettings?.killSwitchEnabled ?? false}
                maxLossPercent={riskSettings?.maxLossPercent ?? null}
                todayPnlPct={todayPnlPct}
              />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader
            title="Strategy performance"
            subtitle="Today's realised P&L per strategy"
            icon={Layers}
            action={<Link href="/app/strategies" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
          />
          <div className="mt-3">
            <StrategyPerformanceList strategies={strategies} />
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Quick actions" icon={Zap} />
          <div className="mt-4">
            <QuickActions />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Recent activity" icon={Activity} />
          <div className="mt-4">
            <ActivityFeed items={activity} />
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader
            title="Recent backtests"
            icon={FlaskConical}
            action={<Link href="/app/backtests" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
          />
          <div className="mt-3">
            <RecentBacktests runs={recentBacktests} />
          </div>
        </Card>
        <div className="flex flex-col gap-6 md:col-span-2 xl:col-span-1">
          <Card className="p-5">
            <CardHeader title="Exposure by instrument" icon={PieChart} />
            <div className="mt-4">
              <AllocationDonut slices={allocationSlices} />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader
              title="Watchlist"
              icon={Star}
              action={<Link href="/app/watchlist" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
            />
            <div className="mt-3">
              <WatchlistSnippet items={watchlistItems.map((w) => ({ symbol: w.instrument.symbol, name: w.instrument.name }))} />
            </div>
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-gold/25 to-brand-primary/15 text-brand-primary">
            <Braces size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-brand-navy">AI Strategy Assistant</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a7437]">
                <Sparkles size={10} /> Coming soon
              </span>
            </div>
            <p className="mt-0.5 text-xs text-brand-navy/60">
              Describe a strategy in plain English and get a built, feasibility-checked strategy back — every rule stays visible and editable.
            </p>
          </div>
        </div>
        <Link href="/#ai-assistant" className="shrink-0 self-start rounded-full border border-brand-primary/25 px-4 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 sm:self-auto">
          Learn more
        </Link>
      </Card>

    </div>
  );
}
