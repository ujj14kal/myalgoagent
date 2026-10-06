import MarketRefresh from "@/components/markets/auto-refresh";
import Link from "next/link";
import FillList from "@/components/ui/fill-list";
import { Activity, Braces, FlaskConical, Landmark, Layers, LineChart, Radio, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPaperSessionRows,
  getPnlByPeriod,
  getRecentActivity,
  getStrategyPerformance,
  getRecentBacktests,
} from "@/lib/portfolio";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import AskAgentButton from "@/components/agent-chat/ask-agent-button";
import { getHealthAlerts } from "@/lib/health";
import { formatPct, toneOf, TONE_TEXT } from "@/lib/format";
import type { AgentPose } from "@/components/robot/agent-2d";
import HealthPanel from "@/components/health-panel";
import AgentBriefing, { type BriefingLine } from "@/components/dashboard/agent-briefing";
import { brokerById } from "@/lib/brokers/catalog";
import RiskGauge from "@/components/dashboard/risk-gauge";
import StrategyPerformanceList from "@/components/dashboard/strategy-performance-list";
import ActivityFeed from "@/components/dashboard/activity-feed";
import WatchlistSnippet from "@/components/dashboard/watchlist-snippet";
import DashboardEmptyState from "@/components/dashboard/dashboard-empty-state";
import RecentBacktests from "@/components/dashboard/recent-backtests";
import QuickActions from "@/components/dashboard/quick-actions";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Dashboard", robots: { index: false } };

/** Midnight IST today. */
function istToday() {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3_600_000);
}

/** Logged in at the broker for today (its session hasn't expired). */
function loggedInToday(b: { status: string; tokenExpiresAt: Date | null }) {
  return b.status === "CONNECTED" && !!b.tokenExpiresAt && b.tokenExpiresAt.getTime() > Date.now();
}

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
      getStrategyPerformance(userId, 10),
      prisma.watchlistItem.findMany({
        where: { userId },
        include: { instrument: { select: { symbol: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.strategy.count({ where: { userId, status: { not: "DELETED" } } }),
      getRecentBacktests(userId, 8),
      getHealthAlerts(userId),
    ]);

  const agentName = user?.agentName ?? DEFAULT_AGENT_NAME;
  // Forward tests are shown one by one (each strategy's hypothetical result) — never pooled into an account.
  const totalStarting = rows.reduce((s, r) => s + r.session.startingCapital, 0);
  const todayPnlPct = totalStarting > 0 ? (pnl.today / totalStarting) * 100 : 0;
  const tests = [...rows].sort((a, b) => Number(b.session.status === "ACTIVE") - Number(a.session.status === "ACTIVE") || b.pnlPct - a.pnlPct).slice(0, 10);
  const best = rows.filter((r) => r.session.status === "ACTIVE").sort((a, b) => b.pnlPct - a.pnlPct)[0];
  const [brokerRows, liveDeployments, liveOrdersToday] = await Promise.all([
    prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true } }),
    prisma.liveDeployment.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.liveOrder.findMany({ where: { userId, createdAt: { gte: istToday() } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, side: true, quantity: true, tradingSymbol: true, status: true, filledQuantity: true, averagePrice: true, createdAt: true } }),
  ]);

  const isNewAccount = strategyCount === 0;
  const liveCount = rows.filter((r) => r.session.status === "ACTIVE").length;
  const openPositions = rows.filter((r) => r.session.positionQuantity !== null).length;
  const critical = healthAlerts.filter((a) => a.severity === "CRITICAL").length;
  const warnings = healthAlerts.length - critical;

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
        { text: "Build one, backtest it on real history, then forward test it before any real money is involved." },
      ]
    : [
        riskSettings?.killSwitchEnabled
          ? { text: "The kill switch is ON — no session can open a new position.", tone: "bad" }
          : { text: `${liveCount} live forward test${liveCount === 1 ? "" : "s"}, ${openPositions} open position${openPositions === 1 ? "" : "s"}.`, tone: liveCount > 0 ? "good" : "neutral" },
        best
          ? { text: `Best running forward test: ${best.session.strategyName} ${formatPct(best.pnlPct)} (hypothetical).`, tone: toneOf(best.pnlPct) === "down" ? "bad" : "neutral" }
          : { text: "No forward test is running — start one from a strategy you've backtested.", tone: "neutral" },
        critical + warnings > 0
          ? { text: `${critical + warnings} item${critical + warnings === 1 ? "" : "s"} need${critical + warnings === 1 ? "s" : ""} your attention in Health below.`, tone: critical > 0 ? "bad" : "warn" }
          : { text: "No risk, redundancy or sync issues found.", tone: "good" },
        ...(riskSettings?.maxLossPercent == null
          ? [{ text: "No max-loss limit is set yet — you can add one in Risk Controls.", tone: "warn" as const }]
          : []),
      ];

  return (
    <div className="space-y-6">
      <MarketRefresh seconds={15} />
      <AgentBriefing
        agentName={agentName}
        greeting={`${greetingFor(new Date())}, ${firstName}`}
        pose={pose}
        lines={lines}
        primaryAction={isNewAccount ? { href: "/app/strategies/new", label: "Create your first strategy" } : { href: "/app/forward-testing", label: "Open forward testing" }}
        secondaryAction={isNewAccount ? { href: "/app/instruments", label: "Browse market data" } : { href: "/app/strategies/new", label: "New strategy" }}
      />

      {isNewAccount && <DashboardEmptyState agentName={agentName} />}

      {(liveDeployments.length > 0 || liveOrdersToday.length > 0) && (
        <Card className="p-5">
          <CardHeader
            title="Live now"
            subtitle="Real orders on your broker account"
            icon={Radio}
            action={<Link href="/app/live-trading" className="text-xs font-semibold text-brand-primary hover:underline">Live Trading →</Link>}
          />
          <div className="mt-3 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Live strategies</p>
              {liveDeployments.length === 0 ? (
                <p className="text-sm text-brand-navy/50">None running.</p>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {liveDeployments.map((d) => {
                    const waiting = ((d.pendingSignals as unknown as unknown[]) ?? []).length;
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <span className={`h-2 w-2 rounded-full ${d.status === "ACTIVE" ? "animate-pulse bg-brand-buy" : "bg-brand-gold"}`} />
                        <span className="font-semibold text-brand-navy">{d.strategyName}</span>
                        <span className="text-xs text-brand-navy/50">
                          {d.instrumentSymbol.replace(/\.NS$/, "")} · {brokerById(d.broker)?.name ?? d.broker}
                        </span>
                        <span className="ml-auto text-xs text-brand-navy/65">
                          {d.status === "PAUSED" ? "paused" : d.positionQty > 0 ? `holding ${d.positionQty}` : "watching"}
                          {waiting > 0 && <span className="ml-1 font-semibold text-brand-primary">· {waiting} to confirm</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Today&apos;s live orders</p>
              {liveOrdersToday.length === 0 ? (
                <p className="text-sm text-brand-navy/50">No live orders today.</p>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {liveOrdersToday.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className={`text-xs font-bold ${o.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}`}>{o.side}</span>
                      <span className="text-brand-navy">
                        {o.quantity} × {o.tradingSymbol}
                      </span>
                      <span className="ml-auto text-xs text-brand-navy/60">
                        {o.status.replace("_", " ").toLowerCase()}
                        {o.filledQuantity > 0 && o.averagePrice ? ` @ ₹${o.averagePrice.toFixed(2)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col p-5 lg:col-span-2">
          <div data-tour="portfolio-chart" className="flex flex-1 flex-col">
            <CardHeader
              title="Forward tests"
              subtitle="Each strategy's own hypothetical result — no real money"
              icon={LineChart}
              action={<Link href="/app/forward-testing" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
            />
            {tests.length === 0 ? (
              <p className="mt-6 text-sm text-brand-navy/50">No forward tests yet. Backtest a strategy, then forward test it on new prices.</p>
            ) : (
              <FillList className="mt-3">
              <ul className="divide-y divide-black/[0.04]">
                {tests.map((r) => (
                  <li key={r.session.id}>
                    <Link href={`/app/forward-testing/${r.session.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-brand-bg/50">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${r.session.status === "ACTIVE" ? "bg-brand-buy" : "bg-brand-navy/20"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-brand-navy">{r.session.strategyName}</span>
                        <span className="block text-xs text-brand-navy/50">
                          {r.session.instrumentSymbol.replace(/\.NS$/, "")} · {r.session.status.toLowerCase()}
                          {r.session.positionQuantity != null ? " · in a position" : ""}
                        </span>
                      </span>
                      <span className={`num text-sm font-semibold ${TONE_TEXT[toneOf(r.pnlPct)]}`}>{formatPct(r.pnlPct)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              </FillList>
            )}
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
        <Card className="flex flex-col p-5 lg:col-span-2">
          <CardHeader
            title="Strategy performance"
            subtitle="Today's realised P&L per strategy"
            icon={Layers}
            action={<Link href="/app/strategies" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
          />
          <FillList className="mt-3">
            <StrategyPerformanceList strategies={strategies} />
          </FillList>
        </Card>
        <Card className="p-5">
          <CardHeader title="Quick actions" icon={Zap} />
          <div className="mt-4">
            <QuickActions />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col p-5">
          <CardHeader title="Recent activity" icon={Activity} />
          <FillList from="md" className="mt-4">
            <ActivityFeed items={activity} />
          </FillList>
        </Card>
        <Card className="flex flex-col p-5">
          <CardHeader
            title="Recent backtests"
            icon={FlaskConical}
            action={<Link href="/app/backtests" className="text-xs font-semibold text-brand-primary hover:underline">View all →</Link>}
          />
          <FillList from="md" className="mt-3">
            <RecentBacktests runs={recentBacktests} />
          </FillList>
        </Card>
        <div className="flex flex-col gap-6 md:col-span-2 xl:col-span-1">
          <Card className="p-5">
            <CardHeader title="Your broker account" icon={Landmark} action={<Link href="/app/portfolio" className="text-xs font-semibold text-brand-primary hover:underline">Portfolio →</Link>} />
            {brokerRows.length === 0 ? (
              <p className="mt-3 text-sm text-brand-navy/55">
                No broker connected.{" "}
                <Link href="/app/broker-connections" className="font-semibold text-brand-primary">
                  Connect one →
                </Link>
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {brokerRows.map((b) => {
                  const live = loggedInToday(b);
                  return (
                    <li key={b.broker} className="flex items-center justify-between">
                      <span className="text-brand-navy">{brokerById(b.broker)?.name ?? b.broker}</span>
                      <Link href={`/app/broker-account?broker=${b.broker}`} className={`text-xs font-semibold ${live ? "text-[#0b6b30]" : "text-[#6f5a22]"}`}>
                        {live ? "connected — view account" : "log in for today"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
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
              <p className="text-sm font-semibold text-brand-navy">{agentName} can do it for you</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-buy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-buy">
                <Sparkles size={10} /> Live
              </span>
            </div>
            <p className="mt-0.5 text-xs text-brand-navy/60">
              Describe a strategy, a backtest or a forward test in plain English — {agentName} prepares it, checks it, and you just review and confirm.
            </p>
          </div>
        </div>
        <AskAgentButton className="self-start sm:self-auto" />
      </Card>

    </div>
  );
}
