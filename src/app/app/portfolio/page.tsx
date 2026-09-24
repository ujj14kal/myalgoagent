import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPaperSessionRows, summarizePortfolio } from "@/lib/portfolio";
import EmptyState from "@/components/empty-state";
import { Banknote, BriefcaseBusiness, PieChart, TrendingUp, Wallet } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import StatusBadge from "@/components/ui/status-badge";
import { formatINR, formatPct, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = { title: "Portfolio", robots: { index: false } };

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const rows = await getPaperSessionRows(session.user.id);
  const { totalCash, totalPositionValue, totalEquity, totalPnlPct } = summarizePortfolio(rows);

  return (
    <div>
      <PageHeader title="Portfolio" icon={Wallet} description={<>Aggregated across all your paper trading sessions — not yet connected to a real broker.</>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available cash" value={formatINR(totalCash)} icon={Banknote} sub="Not tied up in open positions" />
        <StatCard label="Position value" value={formatINR(totalPositionValue)} icon={BriefcaseBusiness} sub="At last close" />
        <StatCard label="Total equity" value={formatINR(totalEquity)} icon={PieChart} sub="Cash + positions" />
        <StatCard label="Overall P&L" value={formatPct(totalPnlPct)} tone={toneOf(totalPnlPct)} icon={TrendingUp} sub="Since each session started" />
      </div>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No paper trading sessions yet." description="Your combined portfolio across all sessions will show up here once you start one." ctaLabel="Go to Paper Trading" ctaHref="/app/paper-trading" />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Instrument</th>
                <th>Status</th>
                <th className="num-cell">Equity</th>
                <th className="num-cell">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session.id}>
                  <td>
                    <Link href={`/app/paper-trading/${r.session.id}`} className="font-medium text-brand-primary hover:underline">
                      {r.session.strategyName}
                    </Link>
                  </td>
                  <td className="font-medium">{r.session.instrumentSymbol}</td>
                  <td>
                    <StatusBadge status={r.session.status} />
                  </td>
                  <td className="num-cell">{formatINR(r.equity)}</td>
                  <td className={`num-cell font-semibold ${TONE_TEXT[toneOf(r.pnlPct)]}`}>{formatPct(r.pnlPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
