import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";

export const metadata = { title: "Positions", robots: { index: false } };

export default async function PositionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const sessions = await prisma.paperSession.findMany({
    where: { userId: session.user.id, positionQuantity: { not: null } },
    orderBy: { updatedAt: "desc" },
  });

  const positions = await Promise.all(
    sessions.map(async (s) => {
      let latestClose = s.positionEntryPrice ?? 0;
      try {
        const candles = await marketDataProvider.getHistoricalCandles(s.instrumentSymbol, "1mo", "1d");
        if (candles.length > 0) latestClose = candles.at(-1)!.close;
      } catch {
        // fall back to entry price if the live quote can't be fetched
      }
      const quantity = s.positionQuantity ?? 0;
      const entryPrice = s.positionEntryPrice ?? 0;
      const unrealizedPnl = (latestClose - entryPrice) * quantity;
      const unrealizedPnlPct = entryPrice > 0 ? (unrealizedPnl / (entryPrice * quantity)) * 100 : 0;
      return { session: s, latestClose, quantity, entryPrice, unrealizedPnl, unrealizedPnlPct };
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Positions</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Currently open positions across your paper trading sessions.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-black/5 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Entry price</th>
              <th className="px-4 py-3">LTP</th>
              <th className="px-4 py-3">Unrealized P&amp;L</th>
              <th className="px-4 py-3">P&amp;L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.session.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/app/paper-trading/${p.session.id}`} className="text-brand-primary hover:underline">
                    {p.session.strategyName}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.session.instrumentSymbol}</td>
                <td className="px-4 py-2">{p.quantity}</td>
                <td className="px-4 py-2">₹{p.entryPrice.toFixed(2)}</td>
                <td className="px-4 py-2">₹{p.latestClose.toFixed(2)}</td>
                <td className={`px-4 py-2 font-medium ${p.unrealizedPnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                  ₹{p.unrealizedPnl.toFixed(2)}
                </td>
                <td className={`px-4 py-2 ${p.unrealizedPnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                  {p.unrealizedPnlPct >= 0 ? "+" : ""}
                  {p.unrealizedPnlPct.toFixed(2)}%
                </td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                  No open positions right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
