import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { teamMembers } from "@/lib/admin/inbox";
import { caseRef, feedbackRef } from "@/lib/support/tickets";
import SupportThread, { type ThreadMessage } from "@/components/support/thread";
import Composer from "@/components/admin/composer";
import TicketControls from "@/components/admin/ticket-controls";
import { Card, Pill, TICKET_LABEL, TICKET_TONE, ago, ist } from "@/components/admin/ui";
import { BROKERS } from "@/lib/brokers/catalog";


export default async function TicketPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireStaff("inbox");
  const { kind, id } = await params;
  if (kind !== "case" && kind !== "feedback") notFound();

  const messages = { orderBy: { createdAt: "asc" as const } };
  const t =
    kind === "case"
      ? await prisma.supportCase.findUnique({ where: { id }, include: { messages } }).then(
          (c) =>
            c && {
              ref: caseRef(c.caseNumber),
              topic: c.subject,
              userId: c.userId,
              email: c.email,
              first: c.message,
              createdAt: c.createdAt,
              status: c.status,
              priority: c.priority,
              assigneeId: c.assigneeId,
              tags: c.tags,
              messages: c.messages,
              context: null as string | null,
            },
        )
      : await prisma.feedback.findUnique({ where: { id }, include: { messages, user: { select: { email: true } } } }).then(
          (f) =>
            f && {
              ref: feedbackRef(f.id),
              topic: `Feedback on ${f.page || "the app"}`,
              userId: f.userId,
              email: f.user.email,
              first: f.message,
              createdAt: f.createdAt,
              status: f.status,
              priority: f.priority,
              assigneeId: f.assigneeId,
              tags: f.tags,
              messages: f.messages,
              context: f.page,
            },
        );
  if (!t) notFound();

  const [user, team, otherCases, otherFeedback] = await Promise.all([
    t.userId
      ? prisma.user.findUnique({
          where: { id: t.userId },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            createdAt: true,
            lastSeenAt: true,
            status: true,
            _count: { select: { strategies: true, backtestRuns: true, paperSessions: true } },
            brokerConnections: { select: { broker: true, status: true } },
          },
        })
      : null,
    teamMembers(),
    t.userId ? prisma.supportCase.count({ where: { userId: t.userId } }) : prisma.supportCase.count({ where: { email: t.email } }),
    t.userId ? prisma.feedback.count({ where: { userId: t.userId } }) : 0,
  ]);

  const name = user?.name ?? t.email;
  const thread: ThreadMessage[] = [
    ...(t.first ? [{ id: "first", author: "USER" as const, authorName: name, body: t.first, createdAt: t.createdAt }] : []),
    ...t.messages,
  ];

  return (
    <div className="space-y-5">
      <Link href="/admin/inbox" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy/50 hover:text-brand-primary">
        <ArrowLeft size={14} /> Inbox
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1b1340] to-brand-primary text-white">
          <MessagesSquare size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-brand-navy/40">
            {t.ref} · {kind === "case" ? "Support request" : "Feedback"} · opened {ist(t.createdAt)}
          </p>
          <h1 className="text-xl font-bold text-brand-navy">{t.topic}</h1>
        </div>
        <Pill tone={TICKET_TONE[t.status]} dot>
          {TICKET_LABEL[t.status]}
        </Pill>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <SupportThread messages={thread} viewer="staff" />
          </Card>
          <Composer kind={kind} id={id} firstName={(user?.name ?? "").split(" ")[0]} canEmail />
          {!t.userId && <p className="text-xs text-brand-navy/45">Sent while signed out — replies go by email only.</p>}
        </div>

        <div className="space-y-4">
          <Card title="Manage">
            <TicketControls kind={kind} id={id} status={t.status} priority={t.priority} assigneeId={t.assigneeId} tags={t.tags} team={team.map((m) => ({ id: m.id, name: m.name }))} />
          </Card>
          <Card title="Who's asking" icon={UserRound}>
            {user ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-brand-navy">{user.name ?? user.username}</p>
                <p className="break-all text-xs text-brand-navy/55">{user.email}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {user.status !== "ACTIVE" && <Pill tone="red">{user.status.toLowerCase().replace("_", " ")}</Pill>}
                  <Pill>joined {ist(user.createdAt, false)}</Pill>
                  <Pill tone="green">seen {ago(user.lastSeenAt)}</Pill>
                </div>
                <p className="pt-1 text-xs text-brand-navy/55">
                  {user._count.strategies} strategies · {user._count.backtestRuns} backtests · {user._count.paperSessions} forward tests
                </p>
                {user.brokerConnections.length > 0 && (
                  <p className="text-xs text-brand-navy/55">
                    Brokers: {user.brokerConnections.map((b) => `${BROKERS.find((x) => x.id === b.broker)?.name ?? b.broker} (${b.status.toLowerCase().replace("_", " ")})`).join(", ")}
                  </p>
                )}
                <p className="text-xs text-brand-navy/55">
                  {otherCases} support request{otherCases === 1 ? "" : "s"} · {otherFeedback} feedback
                </p>
                <Link href={`/admin/users/${user.id}`} className="inline-block pt-1 text-xs font-semibold text-brand-primary">
                  Open profile →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-brand-navy/55">
                {t.email}
                <br />
                <span className="text-xs">Not linked to an account ({otherCases} request{otherCases === 1 ? "" : "s"} from this address).</span>
              </p>
            )}
          </Card>
          {t.context && (
            <Card title="Sent from">
              <p className="break-all font-mono text-xs text-brand-navy/60">{t.context}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
