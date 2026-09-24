import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import EmptyState from "@/components/empty-state";
import { BriefcaseBusiness } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBadge from "@/components/ui/status-badge";
import { formatPct, formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

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
      const priceDiff = s.direction === "SHORT" ? entryPrice - latestClose : latestClose - entryPrice;
      const unrealizedPnl = priceDiff * quantity;
      const unrealizedPnlPct = entryPrice > 0 ? (unrealizedPnl / (entryPrice * quantity)) * 100 : 0;
      return { session: s, latestClose, quantity, entryPrice, unrealizedPnl, unrealizedPnlPct };
    }),
  );

  return (
    <div>
      <PageHeader title="Positions" icon={BriefcaseBusiness} description={<>Currently open positions across your paper trading sessions.</>} />

      {positions.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No open positions right now." description="Positions from active paper trading sessions will show up here." ctaLabel="Go to Paper Trading" ctaHref="/app/paper-trading" />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Instrument</th>
                <th>Side</th>
                <th className="num-cell">Qty</th>
                <th className="num-cell">Entry</th>
                <th className="num-cell">Last close</th>
                <th className="num-cell">Unrealised P&amp;L</th>
                <th className="num-cell">P&amp;L %</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const tone = toneOf(p.unrealizedPnl);
                return (
                  <tr key={p.session.id}>
                    <td>
                      <Link href={`/app/paper-trading/${p.session.id}`} className="font-medium text-brand-primary hover:underline">
                        {p.session.strategyName}
                      </Link>
                    </td>
                    <td className="font-medium">{p.session.instrumentSymbol}</td>
                    <td>
                      <StatusBadge status={p.session.direction === "SHORT" ? "SHORT" : "LONG"} />
                    </td>
                    <td className="num-cell">{p.quantity}</td>
                    <td className="num-cell">₹{formatPrice(p.entryPrice)}</td>
                    <td className="num-cell">₹{formatPrice(p.latestClose)}</td>
                    <td className={`num-cell font-semibold ${TONE_TEXT[tone]}`}>{formatSignedINR(p.unrealizedPnl, 2)}</td>
                    <td className={`num-cell font-semibold ${TONE_TEXT[tone]}`}>{formatPct(p.unrealizedPnlPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
