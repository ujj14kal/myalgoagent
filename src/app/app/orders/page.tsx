import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import { ListOrdered } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBadge from "@/components/ui/status-badge";
import { formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = { title: "Orders", robots: { index: false } };

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const orders = await prisma.paperOrder.findMany({
    where: { paperSession: { userId: session.user.id } },
    include: { paperSession: true },
    orderBy: { time: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader title="Orders" icon={ListOrdered} description={<>Paper trading order history across all your sessions.</>} />

      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No orders yet." description="Start a paper trading session to generate real order history." ctaLabel="Go to Paper Trading" ctaHref="/app/paper-trading" />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Instrument</th>
                <th>Side</th>
                <th className="num-cell">Price</th>
                <th className="num-cell">Qty</th>
                <th className="num-cell">Fees</th>
                <th className="num-cell">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="text-brand-navy/70">{new Date(o.time * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</td>
                  <td>
                    <Link href={`/app/paper-trading/${o.paperSessionId}`} className="font-medium text-brand-primary hover:underline">
                      {o.paperSession.strategyName}
                    </Link>
                  </td>
                  <td className="font-medium">{o.paperSession.instrumentSymbol}</td>
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
