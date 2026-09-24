import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import CandlestickChart from "@/components/candlestick-chart";
import PaperSessionControls from "@/components/paper-session-controls";
import { describePositionSizing } from "@/lib/position-sizing";
import type { Signal } from "@/lib/strategy";
import { Activity, Banknote, BriefcaseBusiness, CandlestickChart as CandleIcon, ListOrdered, PieChart, TrendingUp } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import StatusBadge from "@/components/ui/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatINR, formatPct, formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

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

  // A long opens with a BUY and closes with a SELL; a short is the mirror —
  // its opening fill is a SELL (sold to open) and its closing fill a BUY
  // (bought to cover), so which literal side counts as "entry" flips.
  const opensPosition = (side: "BUY" | "SELL") => (paperSession.direction === "SHORT" ? side === "SELL" : side === "BUY");
  const markers: Signal[] = paperSession.orders.map((o) => ({
    time: o.time,
    type: opensPosition(o.side) ? ("entry" as const) : ("exit" as const),
  }));

  const inPosition = paperSession.positionQuantity !== null;
  const latestClose = candles.at(-1)?.close ?? paperSession.positionEntryPrice ?? 0;
  const quantity = paperSession.positionQuantity ?? 0;
  const entryPrice = paperSession.positionEntryPrice ?? 0;
  const positionValue = inPosition ? latestClose * quantity : 0;
  // Cash is never debited/credited at entry (see EngineState in
  // trading-engine/step.ts) — it only ever reflects realized gains from
  // closed trades — so equity must add the *unrealized gain* of an open
  // position, not its full notional value, or this would double-count the
  // entry cost as profit. Direction flips which way price moving helps.
  const unrealizedGain = inPosition ? (paperSession.direction === "SHORT" ? entryPrice - latestClose : latestClose - entryPrice) * quantity : 0;
  const equity = paperSession.cash + unrealizedGain;
  const pnl = equity - paperSession.startingCapital;
  const pnlPct = (pnl / paperSession.startingCapital) * 100;
  // Cash not tied up in the open position, so the cards add up to equity.
  const availableCash = !inPosition ? paperSession.cash : paperSession.direction === "SHORT" ? paperSession.cash + entryPrice * quantity : paperSession.cash - entryPrice * quantity;
  const signedPosition = paperSession.direction === "SHORT" ? -positionValue : positionValue;

  return (
    <div>
      <PageHeader
        eyebrow="Paper session"
        title={paperSession.strategyName}
        icon={Activity}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-brand-navy">{paperSession.instrumentSymbol}</span>
            <StatusBadge status={paperSession.status} />
            <StatusBadge status={paperSession.direction === "SHORT" ? "SHORT" : "LONG"} />
            <span>· {describePositionSizing(paperSession.positionSizingMode, paperSession.positionSizingValue)}</span>
          </span>
        }
        actions={<PaperSessionControls sessionId={paperSession.id} status={paperSession.status} />}
      />

      <p className="mb-4 flex items-center gap-2 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.08] px-4 py-2.5 text-xs font-medium text-brand-navy/70">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
        Simulated with end-of-day data, not real-time — no real money is involved.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available cash" value={formatINR(availableCash)} icon={Banknote} />
        <StatCard label="Position value" value={formatINR(signedPosition)} icon={BriefcaseBusiness} sub={inPosition ? `${quantity} @ ₹${formatPrice(entryPrice)}` : "No open position"} />
        <StatCard label="Equity" value={formatINR(equity)} icon={PieChart} sub={`Started with ${formatINR(paperSession.startingCapital)}`} />
        <StatCard label="P&L" value={formatPct(pnlPct)} tone={toneOf(pnlPct)} icon={TrendingUp} sub={formatSignedINR(pnl)} />
      </div>

      <Card className="mt-6 p-5">
        <CardHeader title="Price chart" subtitle="Last 3 months · entries and exits marked" icon={CandleIcon} />
        <div className="mt-4">
          {fetchError ? <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p> : <CandlestickChart candles={candles} markers={markers} />}
        </div>
      </Card>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <ListOrdered size={16} className="text-brand-primary" />
          <h2 className="text-sm font-semibold text-brand-navy">Order history</h2>
          <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{paperSession.orders.length}</span>
        </div>
        <div className="overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Side</th>
                <th className="num-cell">Price</th>
                <th className="num-cell">Qty</th>
                <th className="num-cell">Fees</th>
                <th className="num-cell">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {paperSession.orders.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.time * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</td>
                  <td>
                    <StatusBadge status={o.side} />
                  </td>
                  <td className="num-cell">₹{formatPrice(o.price)}</td>
                  <td className="num-cell">{o.quantity}</td>
                  <td className="num-cell text-brand-navy/60">₹{formatPrice(o.fees)}</td>
                  <td className={`num-cell font-semibold ${o.netPnl !== null ? TONE_TEXT[toneOf(o.netPnl)] : "text-brand-navy/40"}`}>
                    {o.netPnl !== null ? formatSignedINR(o.netPnl, 2) : "—"}
                  </td>
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
