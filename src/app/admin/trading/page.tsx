import Link from "next/link";
import { Activity, CalendarClock, Link2, ShieldAlert, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/admin/access";
import { getScheduleState, load } from "@/lib/admin/aws";
import { JOBS, type JobName } from "@/lib/jobs";
import { BROKERS } from "@/lib/brokers/catalog";
import JobControls from "@/components/admin/job-controls";
import { AdminPageHeader, Card, Empty, Kpi, LoadError, Pill, ago, ist } from "@/components/admin/ui";
import { daysAgo } from "@/lib/admin/time";


export default async function TradingPage() {
  const staff = await requireStaff("trading");
  const sys = can(staff.role, "system");
  const dayAgo = daysAgo(1);
  const jobNames = Object.keys(JOBS) as JobName[];

  const [active, paused, orders24, risk7, killSwitches, brokers, failing, recentOrders, recentRisk, runs, schedules] = await Promise.all([
    prisma.paperSession.count({ where: { status: "ACTIVE" } }),
    prisma.paperSession.count({ where: { status: "PAUSED" } }),
    prisma.paperOrder.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.riskEvent.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.riskSettings.count({ where: { killSwitchEnabled: true } }),
    prisma.brokerConnection.groupBy({ by: ["broker", "status"], _count: true }),
    prisma.brokerConnection.findMany({ where: { lastError: { not: null } }, orderBy: { updatedAt: "desc" }, take: 8, select: { broker: true, lastError: true, updatedAt: true, user: { select: { id: true, email: true } } } }),
    prisma.paperOrder.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, side: true, price: true, quantity: true, netPnl: true, createdAt: true, paperSession: { select: { id: true, strategyName: true, instrumentSymbol: true, user: { select: { id: true, email: true } } } } } }),
    prisma.riskEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { type: true, message: true, createdAt: true, user: { select: { id: true, email: true } } } }),
    Promise.all(jobNames.map((j) => prisma.jobRun.findMany({ where: { job: j }, orderBy: { startedAt: "desc" }, take: 40 }))),
    Promise.all(jobNames.map((j) => (sys ? load(() => getScheduleState(JOBS[j].rule)) : Promise.resolve(null)))),
  ]);

  const brokerRows = BROKERS.filter((b) => b.availability === "live").map((b) => {
    const rows = brokers.filter((r) => r.broker === b.id);
    const count = (s?: string) => rows.filter((r) => !s || r.status === s).reduce((a, r) => a + r._count, 0);
    return { id: b.id, name: b.name, logo: b.logo, total: count(), connected: count("CONNECTED"), errors: count("ERROR") };
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Trading ops" icon={Activity} description="Forward testing, the scheduled jobs that keep it running, and broker connection health." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Live sessions" value={active} hint={`${paused} paused`} />
        <Kpi label="Fills (24h)" value={orders24} />
        <Kpi label="Risk events (7d)" value={risk7} tone={risk7 ? "warn" : "default"} />
        <Kpi label="Kill switches on" value={killSwitches} />
        <Kpi label="Broker errors" value={brokerRows.reduce((a, b) => a + b.errors, 0)} tone={brokerRows.some((b) => b.errors) ? "bad" : "good"} />
      </div>

      <div id="jobs" className="grid gap-5 lg:grid-cols-2">
        {jobNames.map((j, k) => {
          const history = runs[k];
          const last = history[0];
          const done = history.filter((r) => r.ok !== null);
          const okRate = done.length ? Math.round((done.filter((r) => r.ok).length / done.length) * 100) : null;
          const sched = schedules[k];
          const enabled = sched && sched.ok ? sched.data === "ENABLED" : null;
          return (
            <Card key={j} title={JOBS[j].label} icon={CalendarClock} action={sched ? sched.ok ? <Pill tone={enabled ? "green" : "gold"} dot>{enabled ? "scheduled" : "paused"}</Pill> : <Pill>schedule unknown</Pill> : undefined}>
              <p className="text-xs text-brand-navy/50">{JOBS[j].schedule}</p>
              <div className="mt-3 flex items-end gap-[3px]" aria-label="Recent runs, oldest to newest">
                {history.length === 0 ? (
                  <p className="text-sm text-brand-navy/45">No runs recorded yet.</p>
                ) : (
                  [...history].reverse().map((r) => (
                    <span
                      key={r.id}
                      title={`${ist(r.startedAt)} — ${r.ok === null ? "running" : r.ok ? "ok" : `failed: ${r.error ?? ""}`}`}
                      className={`h-6 w-2 rounded-sm ${r.ok === null ? "bg-brand-blue/50" : r.ok ? "bg-brand-buy/70" : "bg-brand-sell"}`}
                    />
                  ))
                )}
              </div>
              <p className="mt-3 text-xs text-brand-navy/60">
                {last ? (
                  <>
                    Last run {ago(last.startedAt)} {last.ok === false ? <span className="font-semibold text-brand-sell">— failed: {last.error}</span> : last.summary ? <span className="text-brand-navy/45">— {Object.entries(last.summary as Record<string, unknown>).map(([a, b]) => `${a} ${b}`).join(" · ")}</span> : null}
                    {okRate !== null && <> · {okRate}% ok over the last {done.length}</>}
                  </>
                ) : (
                  "Waiting for the first run."
                )}
              </p>
              {sched && !sched.ok && <div className="mt-2"><LoadError error={sched.error} /></div>}
              {sys && (
                <div className="mt-4">
                  <JobControls job={j} enabled={enabled} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card title="Broker connections" icon={Link2} pad={false}>
        <div id="brokers" className="grid grid-cols-2 gap-px bg-black/[0.04] sm:grid-cols-3 lg:grid-cols-5">
          {brokerRows.map((b) => (
            <div key={b.id} className="flex items-center gap-3 bg-white px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.logo} alt="" className="h-7 w-7 rounded-lg object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-navy">{b.name}</p>
                <p className="text-[11px] text-brand-navy/50">
                  {b.connected}/{b.total} connected{b.errors ? <span className="font-semibold text-brand-sell"> · {b.errors} failing</span> : null}
                </p>
              </div>
            </div>
          ))}
        </div>
        {failing.length > 0 && (
          <div className="border-t border-black/[0.05] px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/40">Latest connection problems</p>
            <ul className="space-y-1.5">
              {failing.map((f, k) => (
                <li key={k} className="text-xs text-brand-navy/65">
                  <span className="font-semibold text-brand-navy">{BROKERS.find((b) => b.id === f.broker)?.name ?? f.broker}</span> · {f.lastError} ·{" "}
                  <Link href={`/admin/users/${f.user.id}`} className="text-brand-primary">
                    {f.user.email}
                  </Link>{" "}
                  · {ago(f.updatedAt)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Latest hypothetical fills" icon={Zap} pad={false}>
          {recentOrders.length === 0 ? (
            <Empty>No fills yet.</Empty>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Pill tone={o.side === "BUY" ? "green" : "red"}>{o.side}</Pill>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-brand-navy">{o.paperSession.instrumentSymbol}</span> <span className="text-brand-navy/45">· {o.paperSession.strategyName}</span>
                    <Link href={`/admin/users/${o.paperSession.user.id}`} className="block truncate text-[11px] text-brand-primary/80">
                      {o.paperSession.user.email}
                    </Link>
                  </span>
                  <span className="text-right text-xs tabular-nums text-brand-navy/70">
                    {o.quantity} @ ₹{o.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    {o.netPnl !== null && <span className={`block font-semibold ${o.netPnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>{o.netPnl >= 0 ? "+" : ""}₹{o.netPnl.toFixed(0)}</span>}
                  </span>
                  <span className="w-14 text-right text-[11px] text-brand-navy/40">{ago(o.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Risk events" icon={ShieldAlert} pad={false}>
          {recentRisk.length === 0 ? (
            <Empty>No risk events.</Empty>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {recentRisk.map((r, k) => (
                <li key={k} className="px-5 py-2.5 text-xs">
                  <p className="text-brand-navy">{r.message}</p>
                  <p className="mt-0.5 text-brand-navy/45">
                    {r.type.toLowerCase().replaceAll("_", " ")} ·{" "}
                    <Link href={`/admin/users/${r.user.id}`} className="text-brand-primary/80">
                      {r.user.email}
                    </Link>{" "}
                    · {ago(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
