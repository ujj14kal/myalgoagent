import Link from "next/link";
import { Activity, AlertTriangle, Bot, CheckCircle2, Inbox, LayoutDashboard, Link2, Mail, Rocket, Server, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/admin/access";
import { overviewStats } from "@/lib/admin/stats";
import { getAlarms, getCost, getDeploys, getEmailStatus, load } from "@/lib/admin/aws";
import { AdminPageHeader, Bars, Card, Kpi, Pill, ago, ist } from "@/components/admin/ui";
import { BROKERS } from "@/lib/brokers/catalog";
import { dueWithin } from "@/lib/admin/time";


type Attention = { tone: "red" | "gold" | "purple"; text: React.ReactNode; href: string };

export default async function AdminOverview() {
  const staff = await requireStaff("inbox");
  const sys = can(staff.role, "system");
  const [s, alarms, email, cost, deploys, lastSync] = await Promise.all([
    overviewStats(),
    sys ? load(getAlarms) : null,
    sys ? load(getEmailStatus) : null,
    sys ? load(() => getCost()) : null,
    sys ? load(() => getDeploys(1)) : null,
    prisma.jobRun.findFirst({ where: { job: "paper-sync" }, orderBy: { startedAt: "desc" } }),
  ]);

  const attention: Attention[] = [];
  const open = s.inbox.openCases + s.inbox.openFeedback;
  if (open) attention.push({ tone: "gold", text: <>{open} conversation{open === 1 ? "" : "s"} waiting for a reply{s.inbox.oldestOpen ? <> — oldest {ago(s.inbox.oldestOpen)}</> : null}</>, href: "/admin/inbox" });
  const firing = alarms?.ok ? alarms.data.filter((a) => a.state === "ALARM") : [];
  if (firing.length) attention.push({ tone: "red", text: <>{firing.length} AWS alarm{firing.length === 1 ? "" : "s"} firing: {firing.map((a) => a.name).join(", ")}</>, href: "/admin/system" });
  if (email?.ok && !email.data.production) attention.push({ tone: "red", text: <>Email is in the AWS sandbox (review: {email.data.review?.toLowerCase() ?? "not requested"}) — real users don&apos;t receive sign-in links, resets or replies.</>, href: "/admin/system#email" });
  if (s.brokers.errors) attention.push({ tone: "gold", text: <>{s.brokers.errors} broker connection{s.brokers.errors === 1 ? " is" : "s are"} failing</>, href: "/admin/trading#brokers" });
  if (lastSync && lastSync.ok === false) attention.push({ tone: "red", text: <>The last paper-trade sync failed ({ago(lastSync.startedAt)})</>, href: "/admin/trading#jobs" });
  if (s.users.nextDeletion && dueWithin(s.users.nextDeletion, 2 * 86_400_000)) attention.push({ tone: "purple", text: <>An account is due for permanent deletion {ago(s.users.nextDeletion).replace(" ago", "")} ({ist(s.users.nextDeletion)})</>, href: "/admin/users?status=PENDING_DELETION" });
  const deploy = deploys?.ok ? deploys.data[0] : null;
  if (deploy?.status === "FAILED") attention.push({ tone: "red", text: <>The latest deploy failed: “{deploy.message}”</>, href: "/admin/system#deploys" });

  const brokerName = (id: string) => BROKERS.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`Good ${greeting()}, ${staff.name.split(" ")[0]}`}
        icon={LayoutDashboard}
        description="How MyAlgoAgent is doing right now — users, support, trading and the platform itself."
      />

      <Card title="Needs attention" icon={AlertTriangle} pad={false}>
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm font-medium text-[#0b6b30]">
            <CheckCircle2 size={17} /> All clear — nothing needs you right now.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {attention.map((a, k) => (
              <li key={k}>
                <Link href={a.href} className="flex items-center gap-3 px-5 py-3 text-sm text-brand-navy hover:bg-brand-bg/70">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.tone === "red" ? "bg-brand-sell" : a.tone === "gold" ? "bg-brand-gold" : "bg-brand-primary"}`} />
                  <span className="flex-1">{a.text}</span>
                  <span className="text-xs font-semibold text-brand-primary">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Users" value={s.users.total} hint={`+${s.users.new7} this week · +${s.users.new30} this month`} href="/admin/users" spark={s.users.signups.map((d) => d.value)} />
        <Kpi label="Active today" value={s.users.active1} hint={`${s.users.active7} active in the last 7 days`} tone="good" />
        <Kpi label="Inbox" value={open} hint={open ? `oldest ${ago(s.inbox.oldestOpen)}` : "nothing waiting"} tone={open ? "warn" : "good"} href="/admin/inbox" />
        <Kpi label="Live paper sessions" value={s.trading.activePaper} hint={lastSync ? `last auto-sync ${ago(lastSync.startedAt)}` : "no auto-sync yet"} href="/admin/trading" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sign-ups · last 30 days" icon={Users} className="lg:col-span-2">
          <Bars data={s.users.signups} />
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Pill tone="blue">{s.trading.strategies} strategies</Pill>
            <Pill tone="purple">{s.trading.backtests7} backtests this week</Pill>
            {s.users.suspended > 0 && <Pill tone="red">{s.users.suspended} suspended</Pill>}
            {s.users.pendingDeletion > 0 && <Pill tone="gold">{s.users.pendingDeletion} pending deletion</Pill>}
          </div>
        </Card>
        <Card title="Broker connections" icon={Link2}>
          {s.brokers.byBroker.length === 0 ? (
            <p className="text-sm text-brand-navy/45">No one has connected a broker yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.brokers.byBroker.map((b) => (
                <li key={b.broker} className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate font-medium text-brand-navy">{brokerName(b.broker)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-navy/[0.06]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-light" style={{ width: `${(b.connected / Math.max(1, b.total)) * 100}%` }} />
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-brand-navy/55">
                    {b.connected}/{b.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-brand-navy/40">connected today / saved keys</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="AI agent · questions per day" icon={Bot} className="lg:col-span-2" action={can(staff.role, "ai") ? <Link href="/admin/ai" className="text-xs font-semibold text-brand-primary">Details →</Link> : undefined}>
          <Bars data={s.ai.daily} color="var(--brand-gold)" />
          <p className="mt-3 text-xs text-brand-navy/50">
            {s.ai.messages7} questions this week · 👍 {s.ai.up} · 👎 {s.ai.down} in the last 30 days
          </p>
        </Card>
        {sys ? (
          <Card title="Platform" icon={Server} action={<Link href="/admin/system" className="text-xs font-semibold text-brand-primary">System →</Link>}>
            <ul className="space-y-3 text-sm">
              <Row icon={Activity} label="Alarms">
                {alarms?.ok ? firing.length ? <Pill tone="red" dot>{firing.length} firing</Pill> : <Pill tone="green" dot>{alarms.data.length} OK</Pill> : <Pill>unavailable</Pill>}
              </Row>
              <Row icon={Mail} label="Email">
                {email?.ok ? email.data.production ? <Pill tone="green" dot>production</Pill> : <Pill tone="red" dot>sandbox</Pill> : <Pill>unavailable</Pill>}
              </Row>
              <Row icon={Rocket} label="Last deploy">
                {deploy ? <Pill tone={deploy.status === "SUCCEED" ? "green" : deploy.status === "FAILED" ? "red" : "blue"} dot>{deploy.status.toLowerCase()} · {ago(deploy.endedAt ?? deploy.startedAt)}</Pill> : <Pill>unavailable</Pill>}
              </Row>
              <Row icon={Inbox} label="AWS this month">
                {cost?.ok ? (
                  <span className="font-semibold tabular-nums text-brand-navy">
                    ${cost.data.value.monthToDate.toFixed(2)}
                    {cost.data.value.forecastMonth !== null && <span className="font-normal text-brand-navy/45"> → ${cost.data.value.forecastMonth.toFixed(0)}</span>}
                  </span>
                ) : (
                  <Pill>unavailable</Pill>
                )}
              </Row>
            </ul>
          </Card>
        ) : (
          <Card title="Platform" icon={Server}>
            <p className="text-sm text-brand-navy/50">System health is visible to admins.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Activity; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-brand-navy/60">
        <Icon size={15} /> {label}
      </span>
      {children}
    </li>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
