import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";

export const metadata = { title: "Portfolio", robots: { index: false } };

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const sessions = await prisma.paperSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const rows = await Promise.all(
    sessions.map(async (s) => {
      let positionValue = 0;
      if (s.positionQuantity !== null) {
        let latestClose = s.positionEntryPrice ?? 0;
        try {
          const candles = await marketDataProvider.getHistoricalCandles(s.instrumentSymbol, "1mo", "1d");
          if (candles.length > 0) latestClose = candles.at(-1)!.close;
        } catch {
          // fall back to entry price if the live quote can't be fetched
        }
        positionValue = latestClose * s.positionQuantity;
      }
      const equity = s.cash + positionValue;
      const pnl = equity - s.startingCapital;
      const pnlPct = (pnl / s.startingCapital) * 100;
      return { session: s, positionValue, equity, pnl, pnlPct };
    }),
  );

  const totalCash = rows.reduce((sum, r) => sum + r.session.cash, 0);
  const totalPositionValue = rows.reduce((sum, r) => sum + r.positionValue, 0);
  const totalEquity = rows.reduce((sum, r) => sum + r.equity, 0);
  const totalStarting = rows.reduce((sum, r) => sum + r.session.startingCapital, 0);
  const totalPnlPct = totalStarting > 0 ? ((totalEquity - totalStarting) / totalStarting) * 100 : 0;

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
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                  No paper trading sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
