import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Bot, KeyRound, LifeBuoy, Link2, Layers, ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can, isBuiltInOwner, requireStaff, ROLE_LABEL } from "@/lib/admin/access";
import { audit } from "@/lib/admin/audit";
import { caseRef, feedbackRef } from "@/lib/support/tickets";
import { BROKERS } from "@/lib/brokers/catalog";
import { avatarInitials } from "@/lib/avatar";
import UserActions from "@/components/admin/user-actions";
import BrokerDisconnect from "@/components/admin/broker-disconnect";
import { Card, Pill, TICKET_LABEL, TICKET_TONE, ago, ist } from "@/components/admin/ui";


/** Phone numbers are shown masked — staff rarely need the full number. */
const maskPhone = (p: string | null) => (p ? p.replace(/\d(?=\d{2})/g, (d, i: number) => (i < 3 ? d : "•")) : "—");

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("users.view");
  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      phone: true,
      image: true,
      emailVerified: true,
      passwordHash: true,
      status: true,
      adminRole: true,
      createdAt: true,
      lastSeenAt: true,
      suspendedAt: true,
      suspendedReason: true,
      deletionScheduledFor: true,
      agentName: true,
      accounts: { select: { provider: true } },
      _count: { select: { strategies: true, backtestRuns: true, paperSessions: true, agentConversations: true, watchlistItems: true } },
    },
  });
  if (!u) notFound();
  await audit(staff, "user.view", { type: "user", id: u.id }, `Viewed ${u.email}`);

  const [sessions, strategies, paper, brokers, cases, feedback, riskEvents, agentStats, trail] = await Promise.all([
    prisma.session.count({ where: { userId: u.id, expires: { gt: new Date() } } }),
    prisma.strategy.findMany({ where: { userId: u.id }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, name: true, status: true, updatedAt: true } }),
    prisma.paperSession.findMany({ where: { userId: u.id }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, strategyName: true, instrumentSymbol: true, status: true, cash: true, startingCapital: true, updatedAt: true } }),
    prisma.brokerConnection.findMany({ where: { userId: u.id }, select: { broker: true, status: true, apiKeyHint: true, accountName: true, connectedAt: true, tokenExpiresAt: true, lastError: true } }),
    prisma.supportCase.findMany({ where: { userId: u.id }, orderBy: { lastActivityAt: "desc" }, take: 10, select: { id: true, caseNumber: true, subject: true, status: true, lastActivityAt: true } }),
    prisma.feedback.findMany({ where: { userId: u.id }, orderBy: { lastActivityAt: "desc" }, take: 10, select: { id: true, page: true, status: true, lastActivityAt: true } }),
    prisma.riskEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5, select: { type: true, message: true, createdAt: true } }),
    prisma.agentMessage.aggregate({ where: { conversation: { userId: u.id }, role: "ASSISTANT" }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.adminAuditLog.findMany({ where: { targetType: "user", targetId: u.id, action: { not: "user.view" } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const role = isBuiltInOwner(u.email) ? "OWNER" : u.adminRole;
  const logins = [u.passwordHash ? "Password" : null, ...u.accounts.map((a) => (a.provider === "google" ? "Google" : a.provider)), "Email link"].filter(Boolean);
  const tickets = [
    ...cases.map((c) => ({ href: `/admin/inbox/case/${c.id}`, ref: caseRef(c.caseNumber), topic: c.subject, status: c.status, at: c.lastActivityAt })),
    ...feedback.map((f) => ({ href: `/admin/inbox/feedback/${f.id}`, ref: feedbackRef(f.id), topic: `Feedback on ${f.page || "the app"}`, status: f.status, at: f.lastActivityAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy/50 hover:text-brand-primary">
        <ArrowLeft size={14} /> Users
      </Link>

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-20px_rgba(14,27,45,0.3)] ring-1 ring-black/[0.05]">
        <div className="h-20 bg-[radial-gradient(120%_140%_at_0%_0%,#2a1766_0%,#471898_45%,#bda360_130%)]" />
        <div className="flex flex-col gap-4 px-6 pb-5 sm:flex-row sm:items-start">
          {u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt="" className="-mt-10 h-20 w-20 shrink-0 rounded-2xl object-cover ring-4 ring-white" />
          ) : (
            <span className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-primary-light text-2xl font-bold text-white ring-4 ring-white">{avatarInitials(u.name, u.email)}</span>
          )}
          <div className="min-w-0 flex-1 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-brand-navy">{u.name ?? u.username ?? u.email}</h1>
              {u.status === "ACTIVE" ? <Pill tone="green" dot>active</Pill> : u.status === "SUSPENDED" ? <Pill tone="red" dot>suspended</Pill> : <Pill tone="gold" dot>deletion {ist(u.deletionScheduledFor, false)}</Pill>}
              {role && <Pill tone="purple">{ROLE_LABEL[role]}</Pill>}
            </div>
            <p className="mt-0.5 break-all text-sm text-brand-navy/55">
              {u.email} {u.username && <>· @{u.username}</>}
            </p>
            <p className="mt-1 text-xs text-brand-navy/45">
              Joined {ist(u.createdAt, false)} · last seen {ago(u.lastSeenAt)} · {sessions} signed-in device{sessions === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="border-t border-black/[0.05] px-6 py-4">
          <UserActions userId={u.id} status={u.status} canManage={can(staff.role, "users.manage")} isSelf={u.id === staff.id} protectedOwner={role === "OWNER"} />
          {u.status === "SUSPENDED" && u.suspendedReason && (
            <p className="mt-3 rounded-xl bg-brand-sell/5 px-3 py-2 text-xs text-[#9b1111]">
              Suspended {ist(u.suspendedAt)}: {u.suspendedReason}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Account" icon={KeyRound}>
          <dl className="space-y-2 text-sm">
            {[
              ["Sign-in methods", logins.join(" · ")],
              ["Email verified", u.emailVerified ? ist(u.emailVerified, false) : "not recorded"],
              ["Phone", maskPhone(u.phone)],
              ["Agent name", u.agentName ?? "default"],
              ["Watchlist", `${u._count.watchlistItems} instruments`],
              ["User ID", u.id],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-brand-navy/45">{k}</dt>
                <dd className="break-all text-right font-medium text-brand-navy">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Brokers" icon={Link2}>
          {brokers.length === 0 ? (
            <p className="text-sm text-brand-navy/45">No broker connected.</p>
          ) : (
            <ul className="space-y-3">
              {brokers.map((b) => {
                const name = BROKERS.find((x) => x.id === b.broker)?.name ?? b.broker;
                return (
                  <li key={b.broker} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-brand-navy">{name}</span>
                      {can(staff.role, "users.manage") && <BrokerDisconnect userId={u.id} broker={b.broker} name={name} />}
                    </div>
                    <p className="mt-0.5 text-xs text-brand-navy/55">
                      <Pill tone={b.status === "CONNECTED" ? "green" : b.status === "ERROR" ? "red" : "gray"}>{b.status.toLowerCase().replace("_", " ")}</Pill> key …{b.apiKeyHint}
                      {b.accountName && ` · ${b.accountName}`}
                      {b.tokenExpiresAt && ` · session until ${ist(b.tokenExpiresAt)}`}
                    </p>
                    {b.lastError && <p className="mt-1 text-[11px] text-brand-sell">{b.lastError}</p>}
                  </li>
                );
              })}
              <li className="text-[11px] text-brand-navy/40">Keys and tokens are encrypted and never shown here.</li>
            </ul>
          )}
        </Card>

        <Card title="AI agent" icon={Bot}>
          <p className="text-sm text-brand-navy">
            {u._count.agentConversations} conversation{u._count.agentConversations === 1 ? "" : "s"} · {agentStats._count} replies
          </p>
          <p className="mt-1 text-xs text-brand-navy/50">
            {((agentStats._sum.inputTokens ?? 0) + (agentStats._sum.outputTokens ?? 0)).toLocaleString("en-IN")} tokens used. Conversation text isn&apos;t shown to staff.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Strategies (${u._count.strategies}) · backtests ${u._count.backtestRuns}`} icon={Layers} pad={false}>
          {strategies.length === 0 ? (
            <p className="px-5 py-4 text-sm text-brand-navy/45">None yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {strategies.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="truncate text-brand-navy">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Pill>{s.status.toLowerCase()}</Pill>
                    <span className="text-[11px] text-brand-navy/40">{ago(s.updatedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Forward testing (${u._count.paperSessions})`} icon={Activity} pad={false}>
          {paper.length === 0 ? (
            <p className="px-5 py-4 text-sm text-brand-navy/45">No sessions.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {paper.map((p) => {
                const pnl = ((p.cash - p.startingCapital) / p.startingCapital) * 100;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-brand-navy">
                      {p.strategyName} <span className="text-brand-navy/45">· {p.instrumentSymbol}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`text-xs font-semibold tabular-nums ${pnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                        {pnl >= 0 ? "+" : ""}
                        {pnl.toFixed(2)}%
                      </span>
                      <Pill tone={p.status === "ACTIVE" ? "green" : "gray"}>{p.status.toLowerCase()}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {riskEvents.length > 0 && (
            <div className="border-t border-black/[0.05] px-5 py-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/40">Recent risk events</p>
              {riskEvents.map((r, k) => (
                <p key={k} className="text-xs text-brand-navy/60">
                  {ago(r.createdAt)} · {r.message}
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Support history" icon={LifeBuoy} pad={false}>
          {tickets.length === 0 ? (
            <p className="px-5 py-4 text-sm text-brand-navy/45">Never contacted us.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {tickets.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-brand-bg/70">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-[11px] text-brand-navy/40">{t.ref}</span> <span className="text-brand-navy">{t.topic}</span>
                    </span>
                    <Pill tone={TICKET_TONE[t.status]}>{TICKET_LABEL[t.status]}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="What the team has done" icon={ScrollText} pad={false}>
          {trail.length === 0 ? (
            <p className="px-5 py-4 text-sm text-brand-navy/45">No staff actions on this account.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {trail.map((a) => (
                <li key={a.id} className="px-5 py-2.5 text-xs">
                  <span className="font-semibold text-brand-navy">{a.summary ?? a.action}</span>
                  <span className="block text-brand-navy/45">
                    {a.actorEmail} · {ist(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
