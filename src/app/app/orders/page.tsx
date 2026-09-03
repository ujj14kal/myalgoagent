import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      <h1 className="text-2xl font-bold text-brand-navy">Orders</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Paper trading order history across all your sessions.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-black/5 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Side</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Fees</th>
              <th className="px-4 py-3">Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-2">{new Date(o.time * 1000).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-2">
                  <Link href={`/app/paper-trading/${o.paperSessionId}`} className="text-brand-primary hover:underline">
                    {o.paperSession.strategyName}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.paperSession.instrumentSymbol}</td>
                <td className={`px-4 py-2 font-medium ${o.side === "BUY" ? "text-brand-buy" : "text-brand-sell"}`}>{o.side}</td>
                <td className="px-4 py-2">₹{o.price.toFixed(2)}</td>
                <td className="px-4 py-2">{o.quantity}</td>
                <td className="px-4 py-2">₹{o.fees.toFixed(2)}</td>
                <td className="px-4 py-2">{o.netPnl !== null ? `₹${o.netPnl.toFixed(2)}` : "—"}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                  No orders yet. Start a paper trading session to generate real order history.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
