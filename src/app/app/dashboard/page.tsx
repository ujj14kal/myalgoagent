import MarketRefresh from "@/components/markets/auto-refresh";
import Link from "next/link";
import FillList from "@/components/ui/fill-list";
import { Braces, FlaskConical, Landmark, Radio, ShieldCheck, Sparkles, Star, TrendingUp, Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentBacktests } from "@/lib/portfolio";
import { liveDashboardPnl } from "@/lib/live/pnl-server";
import { istToday } from "@/lib/live/order-ledger";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import AskAgentButton from "@/components/agent-chat/ask-agent-button";
import TalkToAgentButton from "@/components/agent-chat/talk-to-agent-button";
import { getHealthAlerts } from "@/lib/health";
import type { AgentPose } from "@/components/robot/agent-2d";
import HealthPanel from "@/components/health-panel";
import AgentBriefing, { type BriefingLine } from "@/components/dashboard/agent-briefing";
import { brokerById } from "@/lib/brokers/catalog";
import RiskGauge from "@/components/dashboard/risk-gauge";
import LivePnlCard from "@/components/dashboard/live-pnl";
import WatchlistSnippet from "@/components/dashboard/watchlist-snippet";
import DashboardEmptyState from "@/components/dashboard/dashboard-empty-state";
import RecentBacktests from "@/components/dashboard/recent-backtests";
import QuickActions from "@/components/dashboard/quick-actions";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Dashboard", robots: { index: false } };

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

  const [user, riskSettings, livePnl, watchlistItems, strategyCount, recentBacktests, healthAlerts] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { agentName: true } }),
      prisma.riskSettings.findUnique({ where: { userId } }),
      liveDashboardPnl(userId).catch(() => null),
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
  // Real (live) results only: forward tests are hypothetical and live on their own page.
  const liveCapital = (await prisma.liveDeployment.aggregate({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, _sum: { capital: true } }))._sum.capital ?? 0;
  const todayPnlPct = liveCapital > 0 && livePnl ? (livePnl.total / liveCapital) * 100 : 0;
  const [brokerRows, liveDeployments, liveOrdersToday] = await Promise.all([
    prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true } }),
    prisma.liveDeployment.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.liveOrder.findMany({ where: { userId, createdAt: { gte: istToday() } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, side: true, quantity: true, tradingSymbol: true, status: true, filledQuantity: true, averagePrice: true, createdAt: true } }),
  ]);

  const isNewAccount = strategyCount === 0;
  const liveCount = liveDeployments.filter((d) => d.status === "ACTIVE").length;
  const openPositions = liveDeployments.filter((d) => d.positionQty !== 0).length;
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
  const attention = critical + warnings;
  const lines: BriefingLine[] = isNewAccount
    ? [{ text: "Your workspace is ready — no strategies yet. Build one, backtest it on real history, then forward test it before any real money is involved." }]
    : [
        riskSettings?.killSwitchEnabled
          ? { text: "The kill switch is ON — no strategy can open a new position.", tone: "bad" }
          : { text: `${liveCount} live strateg${liveCount === 1 ? "y" : "ies"} running, ${openPositions} open position${openPositions === 1 ? "" : "s"}.`, tone: liveCount > 0 ? "good" : "neutral" },
        attention > 0
          ? { text: `${attention} item${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} your attention in Health below.`, tone: critical > 0 ? "bad" : "warn" }
          : riskSettings?.maxLossPercent == null
            ? { text: "No max-loss limit is set yet — add one in Risk Controls.", tone: "warn" }
            : { text: "No risk, redundancy or sync issues found.", tone: "good" },
      ];

  return (
    <div className="space-y-6">
      <MarketRefresh seconds={15} />
      <AgentBriefing
        agentName={agentName}
        greeting={`${greetingFor(new Date())}, ${firstName}`}
        pose={pose}
        lines={lines}
        primaryAction={isNewAccount ? { href: "/app/strategies/new", label: "Create your first strategy" } : { href: "/app/live-trading", label: "Live trading" }}
        secondaryAction={isNewAccount ? { href: "/app/instruments", label: "Browse market data" } : { href: "/app/strategies/new", label: "New strategy" }}
        tertiary={<TalkToAgentButton variant="onDark" fullChat />}
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
              title="Live P&L"
              subtitle="Your real strategies, moving with the market"
              icon={TrendingUp}
              action={<Link href="/app/live-trading" className="text-xs font-semibold text-brand-primary hover:underline">Live Trading →</Link>}
            />
            <div className="mt-4">
              <LivePnlCard initial={livePnl} />
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Quick actions" icon={Zap} />
          <div className="mt-4">
            <QuickActions />
          </div>
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
