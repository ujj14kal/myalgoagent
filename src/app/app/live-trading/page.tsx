import Link from "next/link";
import { CheckCircle2, CircleAlert, ListOrdered, PlugZap, Radio, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ComingSoon from "@/components/coming-soon";
import PageHeader from "@/components/ui/page-header";
import ConnectivityTest from "@/components/live/connectivity-test";
import { CancelOrder, RefreshOrders } from "@/components/live/order-actions";
import { egressEnabled } from "@/lib/brokers/egress";
import { LIVE_DEFAULTS, marketOpen } from "@/lib/live/orders";

export const metadata = { title: "Live Trading", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  CREATED: "bg-brand-navy/[0.06] text-brand-navy/60",
  OPEN: "bg-brand-blue-light text-[#23408f]",
  TRIGGER_PENDING: "bg-brand-blue-light text-[#23408f]",
  PARTIALLY_FILLED: "bg-brand-gold/15 text-[#6f5a22]",
  FILLED: "bg-brand-buy/10 text-[#0b6b30]",
  CANCELLED: "bg-brand-navy/[0.06] text-brand-navy/60",
  REJECTED: "bg-brand-sell/10 text-[#9b1111]",
  FAILED: "bg-brand-sell/10 text-[#9b1111]",
};
const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, riskSettings: true } });

  if (!user?.liveTradingEnabledAt) {
    return (
      <ComingSoon
        title="Live Trading"
        icon={Radio}
        description="Run a strategy you've already backtested and forward tested against a real broker account."
        points={[
          "Connect a supported broker account first",
          "Server-side risk checks before every order",
          "Always an explicit, manual start — never automatic",
          "The kill switch covers live orders too",
        ]}
      />
    );
  }

  const [groww, orders, instruments] = await Promise.all([
    prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: "groww" } }, select: { status: true, tokenExpiresAt: true } }),
    prisma.liveOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.instrument.findMany({ where: { exchange: "NSE" }, orderBy: { symbol: "asc" }, select: { symbol: true, name: true } }),
  ]);
  const growwLive = !!groww && groww.status === "CONNECTED" && !!groww.tokenExpiresAt && groww.tokenExpiresAt > new Date();
  const relay = egressEnabled();
  const open = marketOpen();
  const risk = user.riskSettings;
  const checks = [
    { ok: growwLive, label: "Groww connected for today", fix: <Link href="/app/broker-connections?broker=groww" className="font-semibold text-brand-primary">Connect for today →</Link> },
    { ok: relay, label: "Orders leave from your static IP", fix: <span>The static-IP relay isn&apos;t configured.</span> },
    { ok: open, label: "Market open (NSE, Mon–Fri 09:15–15:30 IST)", fix: <span>Orders can only be placed during market hours.</span> },
    { ok: !risk?.killSwitchEnabled, label: "Kill switch off", fix: <Link href="/app/risk-controls" className="font-semibold text-brand-primary">Risk Controls →</Link> },
  ];
  const ready = checks.every((c) => c.ok);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Trading"
        icon={Radio}
        eyebrow="Real orders · Groww"
        description="Real orders on your own Groww account, placed from your registered static IP. Every order is checked on our servers first and recorded with its full history."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <ShieldCheck size={16} className="text-brand-primary" /> Ready to trade?
          </p>
          <ul className="mt-3 space-y-2.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-buy" /> : <CircleAlert size={17} className="mt-0.5 shrink-0 text-brand-gold" />}
                <span>
                  <span className="text-brand-navy">{c.label}</span>
                  {!c.ok && <span className="block text-xs text-brand-navy/55">{c.fix}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-brand-bg/70 px-3 py-2.5 text-xs leading-relaxed text-brand-navy/60">
            Limits on every new order: up to ₹{(risk?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue).toLocaleString("en-IN")} per order and {risk?.liveMaxOrdersPerDay ?? LIVE_DEFAULTS.maxOrdersPerDay} orders a day. Exits
            are never blocked. An identical order within a minute is refused as a duplicate.
          </p>
        </section>

        <section className="surface p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <PlugZap size={16} className="text-brand-primary" /> Connectivity test
          </p>
          <ConnectivityTest instruments={instruments} ready={ready} />
        </section>
      </div>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <ListOrdered size={16} className="text-brand-primary" /> Live orders
          </p>
          <RefreshOrders />
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-brand-navy/45">No live orders yet. Run the connectivity test to send your first one.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {orders.map((o) => (
              <li key={o.id}>
                <details className="group px-5 py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${o.side === "BUY" ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-[#9b1111]"}`}>{o.side}</span>
                    <span className="text-sm font-semibold text-brand-navy">
                      {o.quantity} × {o.tradingSymbol}
                    </span>
                    <span className="text-xs text-brand-navy/55">
                      {o.orderType.replace("_", "-")}
                      {o.price ? ` @ ₹${o.price.toFixed(2)}` : ""} · {o.product} · {o.purpose}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[o.status]}`}>
                      {o.status.replace("_", " ").toLowerCase()}
                      {o.filledQuantity > 0 && o.averagePrice ? ` · ${o.filledQuantity} @ ₹${o.averagePrice.toFixed(2)}` : ""}
                    </span>
                    {(o.status === "OPEN" || o.status === "TRIGGER_PENDING") && <CancelOrder id={o.id} />}
                    <span className="w-full text-[11px] text-brand-navy/40">
                      {when(o.createdAt)} · ref {o.clientRef}
                      {o.brokerOrderId && ` · Groww ${o.brokerOrderId}`}
                      {o.rejectReason && <span className="text-brand-sell"> · {o.rejectReason}</span>}
                    </span>
                  </summary>
                  <ol className="mt-2 space-y-1 border-l-2 border-brand-primary/15 pl-3">
                    {o.reason && <li className="text-xs text-brand-navy/60">{o.reason}</li>}
                    {o.events.map((e) => (
                      <li key={e.id} className="text-[11px] text-brand-navy/55">
                        <span className="font-mono">{when(e.at)}</span> · <strong className="font-semibold text-brand-navy/70">{e.kind.replace("_", " ")}</strong>
                        {e.detail ? ` · ${JSON.stringify(e.detail)}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
