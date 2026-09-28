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
import { LIVE_BROKERS, LIVE_NOT_YET } from "@/lib/brokers/live-brokers";
import { brokerById } from "@/lib/brokers/catalog";

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

  const [conns, orders, instruments, proven] = await Promise.all([
    prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true, status: true, tokenExpiresAt: true } }),
    prisma.liveOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.instrument.findMany({ where: { exchange: "NSE" }, orderBy: { symbol: "asc" }, select: { symbol: true, name: true } }),
    // A broker counts as proven once any connectivity test there has completed cleanly.
    prisma.liveOrder.findMany({ where: { purpose: "test", status: "CANCELLED" }, distinct: ["broker"], select: { broker: true } }),
  ]);
  const provenSet = new Set(proven.map((p) => p.broker));
  const now = new Date();
  const linked = conns
    .map((c) => ({ id: c.broker, name: brokerById(c.broker)?.name ?? c.broker, live: c.status === "CONNECTED" && !!c.tokenExpiresAt && c.tokenExpiresAt > now, adapter: LIVE_BROKERS[c.broker as keyof typeof LIVE_BROKERS], notYet: LIVE_NOT_YET[c.broker as keyof typeof LIVE_NOT_YET] }))
    .sort((a, b) => Number(b.live) - Number(a.live));
  const tradable = linked.filter((b) => b.live && b.adapter).map((b) => ({ id: b.id, name: b.name, verified: !!b.adapter?.verified || provenSet.has(b.id) }));
  const relay = egressEnabled();
  const open = marketOpen();
  const risk = user.riskSettings;
  const checks = [
    { ok: tradable.length > 0, label: "A broker connected for today", fix: <Link href="/app/broker-connections" className="font-semibold text-brand-primary">Broker Connections →</Link> },
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
        eyebrow="Real orders"
        description="Real orders on your own broker account, placed from your registered static IP. Every order is checked on our servers first, read back from your broker to confirm it's the right stock, and recorded with its full history."
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
          {linked.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-black/[0.05] pt-3">
              {linked.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-brand-navy">{b.name}</span>
                  <span className={b.live ? "text-[#0b6b30]" : "text-[#6f5a22]"}>{b.live ? "connected today" : "log in for today"}</span>
                  {b.adapter ? (
                    b.adapter.verified || provenSet.has(b.id) ? (
                      <span className="rounded-full bg-brand-buy/10 px-2 py-px font-semibold text-[#0b6b30]">live orders proven</span>
                    ) : (
                      <span className="rounded-full bg-brand-gold/15 px-2 py-px font-semibold text-[#6f5a22]" title="Built from the broker's official API docs; run the connectivity test once to prove it">not yet proven — run the test</span>
                    )
                  ) : (
                    <span className="rounded-full bg-brand-navy/[0.06] px-2 py-px text-brand-navy/55" title={b.notYet}>live orders coming later</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 rounded-xl bg-brand-bg/70 px-3 py-2.5 text-xs leading-relaxed text-brand-navy/60">
            Limits on every new order: up to ₹{(risk?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue).toLocaleString("en-IN")} per order and {risk?.liveMaxOrdersPerDay ?? LIVE_DEFAULTS.maxOrdersPerDay} orders a day. Exits
            are never blocked. An identical order within a minute is refused as a duplicate.
          </p>
        </section>

        <section className="surface p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <PlugZap size={16} className="text-brand-primary" /> Connectivity test
          </p>
          <ConnectivityTest instruments={instruments} brokers={tradable} ready={ready} />
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
                    <span className="rounded-full bg-brand-navy/[0.05] px-2 py-0.5 text-[11px] text-brand-navy/60">{brokerById(o.broker)?.name ?? o.broker}</span>
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
                      {o.brokerOrderId && ` · broker order ${o.brokerOrderId}`}
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
