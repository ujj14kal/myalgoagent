import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import CandlestickChart from "@/components/candlestick-chart";
import PaperSessionControls from "@/components/paper-session-controls";
import { describePositionSizing } from "@/lib/position-sizing";
import type { Signal } from "@/lib/strategy";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Paper Session ${id}`, robots: { index: false } };
}

export default async function PaperSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const paperSession = await prisma.paperSession.findFirst({
    where: { id, userId: session.user.id },
    include: { orders: { orderBy: { time: "asc" } } },
  });
  if (!paperSession) notFound();

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  try {
    candles = await marketDataProvider.getHistoricalCandles(paperSession.instrumentSymbol, "3mo", "1d");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load market data";
  }

  const markers: Signal[] = paperSession.orders.map((o) => ({
    time: o.time,
    type: o.side === "BUY" ? ("entry" as const) : ("exit" as const),
  }));

  const inPosition = paperSession.positionQuantity !== null;
  const latestClose = candles.at(-1)?.close ?? paperSession.positionEntryPrice ?? 0;
  const positionValue = inPosition ? latestClose * (paperSession.positionQuantity ?? 0) : 0;
  const equity = paperSession.cash + positionValue;
  const pnl = equity - paperSession.startingCapital;
  const pnlPct = (pnl / paperSession.startingCapital) * 100;

  return (
    <div>
      <div className="rounded-xl bg-brand-gold/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/70">
        Paper Trading — simulated using end-of-day data, not real-time. Not real money.
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{paperSession.strategyName}</h1>
          <p className="mt-1 text-sm text-brand-navy/60">
            {paperSession.instrumentSymbol} · Sizing: {describePositionSizing(paperSession.positionSizingMode, paperSession.positionSizingValue)}
          </p>
        </div>
        <PaperSessionControls sessionId={paperSession.id} status={paperSession.status} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Cash</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{paperSession.cash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Position value</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{positionValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Equity</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">₹{equity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">P&amp;L</p>
          <p className={`mt-2 text-xl font-bold ${pnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="mt-8">
        {fetchError ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <CandlestickChart candles={candles} markers={markers} />
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Order history</p>
        <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Fees</th>
                <th className="px-4 py-3">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {paperSession.orders.map((o) => (
                <tr key={o.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2">{new Date(o.time * 1000).toLocaleDateString("en-IN")}</td>
                  <td className={`px-4 py-2 font-medium ${o.side === "BUY" ? "text-brand-buy" : "text-brand-sell"}`}>{o.side}</td>
                  <td className="px-4 py-2">₹{o.price.toFixed(2)}</td>
                  <td className="px-4 py-2">{o.quantity}</td>
                  <td className="px-4 py-2">₹{o.fees.toFixed(2)}</td>
                  <td className="px-4 py-2">{o.netPnl !== null ? `₹${o.netPnl.toFixed(2)}` : "—"}</td>
                </tr>
              ))}
              {paperSession.orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                    No orders yet — watching for a signal since{" "}
                    {paperSession.lastSyncedTime
                      ? new Date(paperSession.lastSyncedTime * 1000).toLocaleDateString("en-IN")
                      : "start"}
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
