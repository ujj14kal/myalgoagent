import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/ui/page-header";
import { brokerById } from "@/lib/brokers/catalog";

export const metadata = { title: "Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Real orders placed through MyAlgoAgent on the user's own broker accounts. Forward-test trades live inside each forward test. */
export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const orders = await prisma.liveOrder.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div>
      <PageHeader
        title="Orders"
        icon={ListOrdered}
        description={
          <>
            Real orders placed through MyAlgoAgent on your broker account. For everything else you traded today, see{" "}
            <Link href="/app/broker-account" className="font-semibold text-brand-primary hover:underline">
              Broker Account
            </Link>
            . Forward-test trades are hypothetical and are shown inside each forward test.
          </>
        }
      />
      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="idle" title="No live orders yet." description="Orders you place from Live Trading or the Options Lab appear here." ctaLabel="Live Trading" ctaHref="/app/live-trading" />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placed</th>
                <th>Broker</th>
                <th>Instrument</th>
                <th>Side</th>
                <th>Type</th>
                <th className="num-cell">Qty (filled)</th>
                <th className="num-cell">Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap text-brand-navy/70">{when(o.createdAt)}</td>
                  <td>{brokerById(o.broker)?.name ?? o.broker}</td>
                  <td className="font-medium">{o.tradingSymbol}</td>
                  <td className={o.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{o.side}</td>
                  <td className="text-xs text-brand-navy/60">
                    {o.orderType.replace("_", "-")} · {o.product}
                  </td>
                  <td className="num-cell">
                    {o.quantity} ({o.filledQuantity})
                  </td>
                  <td className="num-cell">{o.averagePrice ? `₹${o.averagePrice.toFixed(2)}` : o.price ? `₹${o.price.toFixed(2)}` : "—"}</td>
                  <td className="text-xs">
                    {o.status.replace("_", " ").toLowerCase()}
                    {o.rejectReason && <span className="block text-brand-sell">{o.rejectReason}</span>}
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
