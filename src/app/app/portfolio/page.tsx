import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPaperSessionRows, summarizePortfolio } from "@/lib/portfolio";
import EmptyState from "@/components/empty-state";

export const metadata = { title: "Portfolio", robots: { index: false } };

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const rows = await getPaperSessionRows(session.user.id);
  const { totalCash, totalPositionValue, totalEquity, totalPnlPct } = summarizePortfolio(rows);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Portfolio</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Aggregated across all your paper trading sessions — not yet connected to a real broker.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Cash</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{totalCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Position value</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{totalPositionValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Total equity</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{totalEquity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Overall P&amp;L</p>
          <p className={`mt-2 text-xl font-bold ${totalPnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
            {totalPnlPct >= 0 ? "+" : ""}
            {totalPnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No paper trading sessions yet." description="Your combined portfolio across all sessions will show up here once you start one." ctaLabel="Go to Paper Trading" ctaHref="/app/paper-trading" />
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Instrument</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Equity</th>
                <th className="px-4 py-3">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/app/paper-trading/${r.session.id}`} className="text-brand-primary hover:underline">
                      {r.session.strategyName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.session.instrumentSymbol}</td>
                  <td className="px-4 py-2">{r.session.status}</td>
                  <td className="px-4 py-2">₹{r.equity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  <td className={`px-4 py-2 font-medium ${r.pnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                    {r.pnlPct >= 0 ? "+" : ""}
                    {r.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
