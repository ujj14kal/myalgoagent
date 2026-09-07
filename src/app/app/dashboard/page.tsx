import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPaperSessionRows,
  summarizePortfolio,
  getEquityCurve,
  getPnlByPeriod,
  getRecentActivity,
  getStrategyPerformance,
} from "@/lib/portfolio";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import EquityCurveChart from "@/components/equity-curve-chart";
import PnlSummary from "@/components/dashboard/pnl-summary";
import AllocationDonut from "@/components/dashboard/allocation-donut";
import RiskGauge from "@/components/dashboard/risk-gauge";
import StrategyPerformanceList from "@/components/dashboard/strategy-performance-list";
import ActivityFeed from "@/components/dashboard/activity-feed";
import WatchlistSnippet from "@/components/dashboard/watchlist-snippet";
import DashboardEmptyState from "@/components/dashboard/dashboard-empty-state";

export const metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [user, rows, riskSettings, pnl, activity, strategies, watchlistItems, strategyCount] = await Promise.all([
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
    prisma.strategy.count({ where: { userId } }),
  ]);

  const agentName = user?.agentName ?? DEFAULT_AGENT_NAME;
  const summary = summarizePortfolio(rows);
  const equityCurve = await getEquityCurve(userId, summary.totalStarting || 100000);
  const todayPnlPct = summary.totalStarting > 0 ? (pnl.today / summary.totalStarting) * 100 : 0;

  const allocationSlices = rows
    .filter((r) => r.positionValue > 0)
    .map((r) => ({ label: r.session.instrumentSymbol, value: r.positionValue }));

  const isNewAccount = strategyCount === 0;

  return (
    <div>
      {riskSettings?.killSwitchEnabled && (
        <div className="mb-4 rounded-xl border border-brand-sell/30 bg-brand-sell/10 px-4 py-2 text-sm font-medium text-brand-sell">
          Trading halted — kill switch is on. Turn it off in{" "}
          <Link href="/app/risk-controls" className="underline">
            Risk Controls
          </Link>{" "}
          to resume.
        </div>
      )}

      <h1 className="text-2xl font-bold text-brand-navy">
        Welcome, {session.user.name ?? session.user.email}
      </h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        {agentName} is keeping an eye on your portfolio. Here&rsquo;s where things stand.
      </p>

      {isNewAccount && (
        <div className="mt-8">
          <DashboardEmptyState agentName={agentName} />
        </div>
      )}

      <div className="mt-8 grid gap-6">
        <PnlSummary pnl={pnl} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div data-tour="portfolio-chart" className="hover-lift rounded-2xl border border-black/5 bg-white p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-navy">Portfolio value</p>
                <span className={`text-sm font-semibold ${summary.totalPnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                  {summary.totalPnlPct >= 0 ? "+" : ""}
                  {summary.totalPnlPct.toFixed(2)}%
                </span>
              </div>
              <div className="mt-3">
                <EquityCurveChart points={equityCurve} />
              </div>
            </div>

            <div className="hover-lift rounded-2xl border border-black/5 bg-white p-5">
              <p className="mb-3 text-sm font-semibold text-brand-navy">Exposure by instrument</p>
              <AllocationDonut slices={allocationSlices} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="hover-lift rounded-2xl border border-black/5 bg-white p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-navy">Strategy performance (today)</p>
                <Link href="/app/strategies" className="text-xs font-medium text-brand-primary hover:underline">
                  View all →
                </Link>
              </div>
              <div className="mt-3">
                <StrategyPerformanceList strategies={strategies} />
              </div>
            </div>

            <div className="hover-lift rounded-2xl border border-black/5 bg-white p-5">
              <p className="mb-3 text-sm font-semibold text-brand-navy">Risk exposure</p>
              <RiskGauge
                killSwitchEnabled={riskSettings?.killSwitchEnabled ?? false}
                maxLossPercent={riskSettings?.maxLossPercent ?? null}
                todayPnlPct={todayPnlPct}
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="hover-lift rounded-2xl border border-black/5 bg-white p-5">
              <p className="mb-3 text-sm font-semibold text-brand-navy">Recent activity</p>
              <ActivityFeed items={activity} />
            </div>

            <div className="hover-lift rounded-2xl border border-black/5 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-navy">Watchlist</p>
                <Link href="/app/watchlist" className="text-xs font-medium text-brand-primary hover:underline">
                  View all →
                </Link>
              </div>
              <WatchlistSnippet
                items={watchlistItems.map((w) => ({ symbol: w.instrument.symbol, name: w.instrument.name }))}
              />
            </div>
          </div>
      </div>
    </div>
  );
}
