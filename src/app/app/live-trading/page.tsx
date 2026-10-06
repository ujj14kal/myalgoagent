import { explainLive } from "@/lib/live/explain-live";
import type { ConditionNode } from "@/lib/strategy/types";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Globe, ListOrdered, Plug, Radio, Rocket, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import ReadinessCheck from "@/components/live/readiness-check";
import CopyIp from "@/components/live/copy-ip";
import EngineFeed from "@/components/live/engine-feed";
import AutoRefresh from "@/components/live/auto-refresh";
import { DeploymentControls, PendingSignalActions } from "@/components/live/deployment-controls";
import { CancelOrder, RefreshOrders } from "@/components/live/order-actions";
import { egressEnabled, registeredStaticIp } from "@/lib/brokers/egress";
import { LIVE_DEFAULTS, marketOpen } from "@/lib/live/orders";
import { LIVE_BROKERS, LIVE_NOT_YET } from "@/lib/brokers/live-brokers";
import { brokerById } from "@/lib/brokers/catalog";
import type { PendingSignal } from "@/lib/live/deployments";
import type { Readiness } from "@/lib/live/readiness";

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
const DEPLOY_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-[#0b6b30]",
  PAUSED: "bg-brand-gold/15 text-[#6f5a22]",
  STOPPED: "bg-brand-navy/[0.06] text-brand-navy/55",
};
const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });
const plain = (s: string) => s.replace(/\.NS$/, "");

/** How a broker connection stands today (computed outside render so the clock isn't read during render). */
function connectionState(c: { status: string; tokenExpiresAt: Date | null; liveReadyAt: Date | null }, nowMs: number) {
  const loggedIn = c.status === "CONNECTED" && !!c.tokenExpiresAt && c.tokenExpiresAt.getTime() > nowMs;
  const ready = loggedIn && !!c.liveReadyAt && nowMs - c.liveReadyAt.getTime() < 24 * 3_600_000;
  return { loggedIn, ready };
}

/** The newest orders shown here; the full, searchable list is on the Orders page. */
const RECENT_ORDERS = 10;

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, liveStaticIp: true, riskSettings: true } });
  const [conns, orders, deployments, orderCount] = await Promise.all([
    prisma.brokerConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { broker: true, status: true, tokenExpiresAt: true, liveReadyAt: true, liveReadyDetail: true, accountName: true } }),
    prisma.liveOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: RECENT_ORDERS, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.liveDeployment.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 30 }),
    prisma.liveOrder.count({ where: { userId } }),
  ]);
  const nowMs = new Date().getTime();
  const staticIp = registeredStaticIp(user?.liveStaticIp);
  const relay = egressEnabled();
  const open = marketOpen();
  const risk = user?.riskSettings;
  const enabled = !!user?.liveTradingEnabledAt;
  const connections = conns.map((c) => ({
    ...c,
    name: brokerById(c.broker)?.name ?? c.broker,
    adapter: LIVE_BROKERS[c.broker as keyof typeof LIVE_BROKERS],
    notYet: LIVE_NOT_YET[c.broker as keyof typeof LIVE_NOT_YET],
    ...connectionState(c, nowMs),
    readiness: c.liveReadyDetail as unknown as Readiness | null,
  }));
  const checkable = connections.filter((c) => c.loggedIn && c.adapter).map((c) => ({ id: c.broker, name: c.name }));
  const liveNow = deployments.filter((d) => d.status !== "STOPPED");
  // What each live strategy is doing, and why it hasn't traded (computed here so the clock isn't read during render).
  const now = new Date(nowMs);
  const statusOf = new Map(
    liveNow.map((d) => {
      const st = d.engineState as unknown as { direction: "LONG" | "SHORT"; entryCondition: ConditionNode; exitCondition: ConditionNode };
      const status = explainLive({
        status: d.status as "ACTIVE" | "PAUSED" | "STOPPED",
        now,
        startedAt: d.startedAt,
        lastCheckedAt: d.lastCheckedAt,
        lastError: d.lastError,
        positionQty: d.positionQty,
        positionAvgPrice: d.positionAvgPrice,
        direction: st.direction,
        entryCondition: st.entryCondition,
        exitCondition: st.exitCondition,
        symbol: d.instrumentSymbol,
        lastOrder: orders.find((o) => o.deploymentId === d.id) ?? null,
      });
      return [d.id, status] as const;
    }),
  );

  return (
    <div className="min-w-0 space-y-6">
      <AutoRefresh seconds={15} />
      <PageHeader
        title="Live Trading"
        icon={Radio}
        eyebrow="Real orders"
        description="Deploy your strategies to your own broker account and follow every real order. Orders leave from your registered static IP, pass our checks first, and are read back from your broker to confirm they're right."
      />

      {!enabled && (
        <p className="flex items-start gap-2 rounded-xl bg-brand-gold/10 px-4 py-3 text-sm text-brand-navy/75 ring-1 ring-brand-gold/25">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-[#8a7437]" />
          Live trading isn&apos;t switched on for your account yet. You can connect brokers and check readiness now; strategies can go live once it&apos;s on.
        </p>
      )}

      {(liveNow.length > 0 || enabled) && <EngineFeed strategies={deployments.map((d) => ({ id: d.id, name: d.strategyName }))} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface min-w-0 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <Globe size={16} className="text-brand-primary" /> Your static IP
          </p>
          {staticIp ? (
            <>
              <p className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-2xl font-bold text-brand-navy">{staticIp}</span>
                <CopyIp ip={staticIp} />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${relay ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-[#9b1111]"}`}>{relay ? "active" : "not set up"}</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-brand-navy/60">
                This IP is assigned to your account only. Register it as the static IP in each broker&apos;s API / developer settings: brokers only accept orders from the IP registered on your account.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-brand-navy/60">No static IP is assigned to your account yet. It comes with the live trading plan — we&apos;ll email it to you, and it will show here. Brokers reject live orders without one.</p>
          )}
          <ul className="mt-4 space-y-2 border-t border-black/[0.05] pt-3 text-sm">
            {[
              { ok: open, label: open ? "Market open" : "Market closed (NSE, Mon–Fri 09:15–15:30 IST)" },
              { ok: !risk?.killSwitchEnabled, label: risk?.killSwitchEnabled ? "Kill switch ON — new positions blocked" : "Kill switch off" },
            ].map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                {c.ok ? <CheckCircle2 size={15} className="text-brand-buy" /> : <CircleAlert size={15} className="text-brand-gold" />}
                <span className="text-brand-navy/75">{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-brand-bg/70 px-3 py-2 text-xs leading-relaxed text-brand-navy/60">
            Limits on every new order: up to ₹{(risk?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue).toLocaleString("en-IN")} per order and {risk?.liveMaxOrdersPerDay ?? LIVE_DEFAULTS.maxOrdersPerDay} orders a day
            (<Link href="/app/risk-controls" className="font-semibold text-brand-primary">Risk Controls</Link>). Exits are never blocked.
          </p>
        </section>

        <section className="surface min-w-0 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <Plug size={16} className="text-brand-primary" /> Broker connections
          </p>
          {connections.length === 0 ? (
            <p className="text-sm text-brand-navy/55">
              No broker connected. <Link href="/app/broker-connections" className="font-semibold text-brand-primary">Connect one →</Link>
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {connections.map((c) => (
                <li key={c.broker} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="font-semibold text-brand-navy">{c.name}</span>
                  {c.accountName && <span className="text-xs text-brand-navy/45">{c.accountName}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className={`rounded-full px-2 py-0.5 ${c.loggedIn ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-gold/15 text-[#6f5a22]"}`}>{c.loggedIn ? "logged in today" : c.status === "CONNECTED" ? "log in for today" : c.status.replace(/_/g, " ").toLowerCase()}</span>
                    {c.adapter ? (
                      <span className={`rounded-full px-2 py-0.5 ${c.ready ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-navy/[0.06] text-brand-navy/55"}`} title={c.readiness?.checkedAt ? `Checked ${when(new Date(c.readiness.checkedAt))}` : undefined}>
                        {c.ready ? "ready for live orders" : c.readiness && !c.readiness.ready ? "not ready — see check" : "run the readiness check"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-brand-navy/55" title={c.notYet}>live orders coming later</span>
                    )}
                    {c.adapter && <span className="rounded-full bg-brand-navy/[0.04] px-2 py-0.5 text-brand-navy/50">{c.adapter.fno ? (c.adapter.fno === "intraday" ? "stocks + F&O intraday" : "stocks + F&O") : "stocks"}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-black/[0.05] pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <ShieldCheck size={15} className="text-brand-primary" /> Ready to go live?
            </p>
            <ReadinessCheck brokers={checkable} />
          </div>
        </section>
      </div>

      <section className="surface min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.05] px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <Rocket size={16} className="text-brand-primary" /> Live strategies
          </p>
          <span className="text-xs text-brand-navy/45">Deploy a strategy from its page with Go live</span>
        </div>
        {liveNow.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-navy/50">
            No strategy is live yet. Open a strategy you&apos;ve backtested and forward tested, then press <strong>Go live</strong>.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {liveNow.map((d) => {
              const pending = (d.pendingSignals as unknown as PendingSignal[]) ?? [];
              return (
                <li key={d.id} className="min-w-0 space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-brand-navy">{d.strategyName}</span>
                    <span className="text-xs text-brand-navy/55">
                      {plain(d.instrumentSymbol)} · {brokerById(d.broker)?.name ?? d.broker} · {d.product === "MIS" ? "intraday" : "delivery"} · ₹{d.capital.toLocaleString("en-IN")} capital
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DEPLOY_STYLE[d.status]}`}>{d.status.toLowerCase()}</span>
                    <span className="rounded-full bg-brand-navy/[0.05] px-2 py-0.5 text-[11px] font-semibold text-brand-navy/60">{d.mode === "AUTO" ? "automatic orders" : "you confirm each order"}</span>
                  </div>
                  {(() => {
                    const st = statusOf.get(d.id)!;
                    const tone = st.tone === "warn" ? "bg-brand-gold/10 ring-brand-gold/25 text-[#6f5a22]" : st.tone === "ok" ? "bg-brand-buy/[0.07] ring-brand-buy/20 text-[#0b6b30]" : "bg-brand-navy/[0.04] ring-black/5 text-brand-navy/70";
                    return (
                      <div className={`min-w-0 rounded-lg px-3 py-2 text-xs ring-1 ${tone}`}>
                        <p className="font-semibold">{st.headline}</p>
                        {st.detail && <p className="mt-0.5 break-words text-[11px] opacity-90">{st.detail}</p>}
                      </div>
                    );
                  })()}
                  {d.lastError && d.status === "ACTIVE" && <p className="break-words rounded-lg bg-brand-sell/5 px-3 py-1.5 text-xs text-brand-sell">{d.lastError}</p>}
                  {pending.map((sig, i) => (
                    <div key={`${sig.signalTime}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-primary/[0.05] px-3 py-2 text-sm">
                      <span className={`font-bold ${sig.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}`}>{sig.side}</span>
                      <span className="text-brand-navy">
                        {sig.quantity} × {plain(d.instrumentSymbol)} — {sig.reason}
                      </span>
                      <span className="text-xs text-brand-navy/45">{when(new Date(sig.createdAt))}</span>
                      <PendingSignalActions id={d.id} index={i} />
                    </div>
                  ))}
                  <DeploymentControls id={d.id} status={d.status} hasPosition={d.positionQty > 0} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="surface min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <ListOrdered size={16} className="text-brand-primary" /> Latest live orders
          </p>
          <span className="flex items-center gap-3">
            {orderCount > 0 && (
              <Link href="/app/orders" className="text-xs font-semibold text-brand-primary hover:underline">
                All {orderCount.toLocaleString("en-IN")} orders — search &amp; filter →
              </Link>
            )}
            <RefreshOrders />
          </span>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-brand-navy/45">No live orders yet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {orders.map((o) => (
              <li key={o.id} className="min-w-0">
                <details className="group min-w-0 px-5 py-3">
                  <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${o.side === "BUY" ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-[#9b1111]"}`}>{o.side}</span>
                    <span className="min-w-0 break-words text-sm font-semibold text-brand-navy">
                      {o.quantity} × {o.tradingSymbol}
                    </span>
                    <span className="rounded-full bg-brand-navy/[0.05] px-2 py-0.5 text-[11px] text-brand-navy/60">{brokerById(o.broker)?.name ?? o.broker}</span>
                    <span className="text-xs text-brand-navy/55">
                      {o.orderType.replace("_", "-")}
                      {o.price ? ` @ ₹${o.price.toFixed(2)}` : ""} · {o.product} · {o.deploymentId ? "strategy" : o.purpose}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[o.status]}`}>
                      {o.status.replace("_", " ").toLowerCase()}
                      {o.filledQuantity > 0 && o.averagePrice ? ` · ${o.filledQuantity} @ ₹${o.averagePrice.toFixed(2)}` : ""}
                    </span>
                    {(o.status === "OPEN" || o.status === "TRIGGER_PENDING") && <CancelOrder id={o.id} />}
                    <span className="w-full break-words text-[11px] text-brand-navy/40">
                      {when(o.createdAt)} · ref {o.clientRef}
                      {o.brokerOrderId && ` · broker order ${o.brokerOrderId}`}
                      {o.rejectReason && <span className="text-brand-sell"> · {o.rejectReason}</span>}
                    </span>
                  </summary>
                  <ol className="mt-2 min-w-0 space-y-1 border-l-2 border-brand-primary/15 pl-3">
                    {o.reason && <li className="break-words text-xs text-brand-navy/60">{o.reason}</li>}
                    {o.events.map((e) => (
                      <li key={e.id} className="break-all text-[11px] text-brand-navy/55">
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
