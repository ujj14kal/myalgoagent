import MarketRefresh from "@/components/markets/auto-refresh";
import type { Prisma } from "@prisma/client";
import Pager from "@/components/ui/pager";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/ui/page-header";
import { brokerById } from "@/lib/brokers/catalog";
import StatusBadge from "@/components/ui/status-badge";
import { istDay, orderLedgerInfo } from "@/lib/live/order-ledger";

export const metadata = { title: "Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const dayLabel = (key: string) => new Date(`${key}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const STATUS_TONE: Record<string, string> = { FILLED: "text-[#0b6b30]", REJECTED: "text-brand-sell", FAILED: "text-brand-sell", CANCELLED: "text-brand-navy/50" };

/** Real orders placed through MyAlgoAgent on the user's own broker accounts. Forward-test trades live inside each forward test. */
const STATUS_FILTERS: Record<string, { label: string; statuses: string[] }> = {
  open: { label: "Working", statuses: ["CREATED", "OPEN", "TRIGGER_PENDING", "PARTIALLY_FILLED"] },
  filled: { label: "Filled", statuses: ["FILLED"] },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"] },
  rejected: { label: "Refused or failed", statuses: ["REJECTED", "FAILED"] },
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = one(sp.status) && STATUS_FILTERS[one(sp.status)!] ? one(sp.status)! : "";
  const q = (one(sp.q) ?? "").trim().slice(0, 30);
  // Filtering and paging happen in the database: only the page being shown is read.
  const where: Prisma.LiveOrderWhereInput = {
    userId: session.user.id,
    ...(status ? { status: { in: STATUS_FILTERS[status].statuses as never[] } } : {}),
    ...(q ? { tradingSymbol: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.liveOrder.count({ where });
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(total, page, size);
  const orders = await prisma.liveOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: win.skip, take: win.take });
  const filtered = !!(status || q);
  // A ledger: grouped by (Indian) day, newest first, with what was bought and sold each day.
  const days: { day: string; rows: typeof orders; bought: number; sold: number }[] = [];
  for (const o of orders) {
    const key = istDay(o.createdAt);
    let g = days[days.length - 1];
    if (!g || g.day !== key) days.push((g = { day: key, rows: [], bought: 0, sold: 0 }));
    g.rows.push(o);
    const px = o.averagePrice ?? o.price;
    if (px && o.filledQuantity > 0) {
      if (o.side === "BUY") g.bought += px * o.filledQuantity;
      else g.sold += px * o.filledQuantity;
    }
  }

  return (
    <div>
      <MarketRefresh seconds={5} />
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
      {(total > 0 || filtered) && (
        <form method="get" className="mt-6 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1 text-brand-navy/55">
            Status
            <select name="status" defaultValue={status} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy">
              <option value="">All</option>
              {Object.entries(STATUS_FILTERS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-brand-navy/55">
            Stock
            <input name="q" defaultValue={q} placeholder="e.g. TARIL" maxLength={30} className="w-36 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy" />
          </label>
          <input type="hidden" name="size" value={size} />
          <button type="submit" className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white">
            Filter
          </button>
          {filtered && (
            <Link href="/app/orders" className="px-1 py-1.5 text-xs font-semibold text-brand-primary">
              Clear
            </Link>
          )}
        </form>
      )}
      {orders.length === 0 ? (
        <div className="mt-8">
          {filtered ? (
            <EmptyState pose="idle" title="No orders match." description="Try a different status or stock, or clear the filter." ctaLabel="Clear filter" ctaHref="/app/orders" />
          ) : (
            <EmptyState pose="idle" title="No live orders yet." description="Orders you place from Live Trading or the Options Lab appear here." ctaLabel="Live Trading" ctaHref="/app/live-trading" />
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Stock</th>
                <th>Action</th>
                <th className="num-cell">Qty (filled)</th>
                <th className="num-cell">Price</th>
                <th className="num-cell">Value</th>
                <th>Status</th>
                <th>Why</th>
              </tr>
            </thead>
            {days.map((g) => (
              <tbody key={g.day}>
                <tr className="bg-brand-bg/70">
                  <td colSpan={8} className="!py-2 text-xs">
                    <span className="font-semibold text-brand-navy">{dayLabel(g.day)}</span>
                    <span className="ml-3 text-brand-navy/55">
                      {g.rows.length} order{g.rows.length === 1 ? "" : "s"}
                      {g.bought > 0 && <> · bought {inr(g.bought)}</>}
                      {g.sold > 0 && <> · sold {inr(g.sold)}</>}
                    </span>
                  </td>
                </tr>
                {g.rows.map((o) => {
                  const info = orderLedgerInfo({ purpose: o.purpose, reason: o.reason, side: o.side });
                  const px = o.averagePrice ?? o.price;
                  const value = px ? px * (o.filledQuantity || o.quantity) : null;
                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap text-brand-navy/70" title={brokerById(o.broker)?.name ?? o.broker}>
                        {time(o.createdAt)}
                      </td>
                      <td className="font-medium">
                        {o.tradingSymbol}
                        <span className="block text-[11px] font-normal text-brand-navy/45">
                          {o.orderType.replace("_", "-")} · {o.product === "MIS" ? "intraday" : o.product === "CNC" ? "delivery" : o.product}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge status={o.side} label={o.side === "BUY" ? "buy" : "sell"} />
                          <span className="text-xs font-semibold text-brand-navy/70">{info.kind}</span>
                        </span>
                        {info.strategy && <span className="block max-w-[11rem] truncate text-[11px] text-brand-navy/45">{info.strategy}</span>}
                      </td>
                      <td className="num-cell">
                        {o.quantity} ({o.filledQuantity})
                      </td>
                      <td className="num-cell">{px ? inr(px) : "—"}</td>
                      <td className="num-cell">{value ? inr(value) : "—"}</td>
                      <td className={`text-xs ${STATUS_TONE[o.status] ?? ""}`}>
                        {o.status.replace("_", " ").toLowerCase()}
                        {o.rejectReason && <span className="block text-brand-sell">{o.rejectReason}</span>}
                      </td>
                      <td className="max-w-[16rem] text-xs text-brand-navy/70">{info.why || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <Pager basePath="/app/orders" params={{ status, q }} window={win} />
    </div>
  );
}
