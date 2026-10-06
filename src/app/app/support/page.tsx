import Pager from "@/components/ui/pager";
import ListToolbar from "@/components/ui/list-toolbar";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";
import { LifeBuoy, MessageSquareText } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import SupportForm from "@/components/support-form";
import SupportThread, { type ThreadMessage } from "@/components/support/thread";
import SupportReplyBox from "@/components/support/reply-box";
import { caseRef, feedbackRef } from "@/lib/support/tickets";

export const metadata = { title: "Help & Support", robots: { index: false } };

const STATUS = {
  OPEN: { label: "Waiting for our team", cls: "bg-brand-gold/15 text-[#6f5a22]" },
  PENDING: { label: "We replied", cls: "bg-brand-primary/10 text-brand-primary" },
  RESOLVED: { label: "Solved", cls: "bg-brand-buy/10 text-[#0b6b30]" },
} as const;

const visible = { where: { author: { not: "NOTE" as const } }, orderBy: { createdAt: "asc" as const } };

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const open = qText(sp.open, 80);
  const q = qText(sp.q);
  const status = qEnum(sp.status, ["all", "OPEN", "PENDING", "RESOLVED"] as const, "all");
  const kind = qEnum(sp.kind, ["all", "case", "feedback"] as const, "all");

  // Requests and feedback are two tables shown as one list: find the page from their ids and dates
  // (searched and filtered in the database), then load full conversations for that page only.
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const st = status !== "all" ? { status } : {};
  const [allCount, caseKeys, feedbackKeys] = await Promise.all([
    Promise.all([prisma.supportCase.count({ where: { userId } }), prisma.feedback.count({ where: { userId } })]).then(([a, b]) => a + b),
    kind === "feedback" ? [] : prisma.supportCase.findMany({ where: { userId, ...st, ...(like ? { OR: [{ subject: like }, { message: like }] } : {}) }, select: { id: true, lastActivityAt: true } }),
    kind === "case" ? [] : prisma.feedback.findMany({ where: { userId, ...st, ...(like ? { OR: [{ page: like }, { message: like }] } : {}) }, select: { id: true, lastActivityAt: true } }),
  ]);
  const keys = [...caseKeys.map((c) => ({ kind: "case" as const, ...c })), ...feedbackKeys.map((f) => ({ kind: "feedback" as const, ...f }))].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  const { page: asked, size } = readPageQuery(sp, 10);
  // A link to one conversation (?open=case-…, e.g. from a reply notification) lands on its page.
  const openAt = open && !sp.page ? keys.findIndex((k) => `${k.kind}-${k.id}` === open) : -1;
  const { rows: pageKeys, win } = pageRows(keys, openAt >= 0 ? Math.floor(openAt / size) + 1 : asked, size);
  const params = keepParams({ q, status: status === "all" ? undefined : status, kind: kind === "all" ? undefined : kind, size: size === 10 ? undefined : String(size) });
  const [cases, feedback] = await Promise.all([
    prisma.supportCase.findMany({ where: { id: { in: pageKeys.filter((k) => k.kind === "case").map((k) => k.id) } }, include: { messages: visible } }),
    prisma.feedback.findMany({ where: { id: { in: pageKeys.filter((k) => k.kind === "feedback").map((k) => k.id) } }, include: { messages: visible } }),
  ]);
  // Opening this page reads any "support replied" notifications.
  await prisma.notification.updateMany({ where: { userId, type: "SUPPORT_REPLY", read: false }, data: { read: true } });

  const name = session.user?.name ?? "You";
  const threads = [
    ...cases.map((c) => ({
      kind: "case" as const,
      id: c.id,
      ref: caseRef(c.caseNumber),
      topic: c.subject,
      status: c.status,
      at: c.lastActivityAt,
      messages: [
        ...(c.message ? [{ id: `${c.id}-first`, author: "USER" as const, authorName: name, body: c.message, createdAt: c.createdAt }] : []),
        ...c.messages,
      ] as ThreadMessage[],
    })),
    ...feedback.map((f) => ({
      kind: "feedback" as const,
      id: f.id,
      ref: feedbackRef(f.id),
      topic: `Feedback on ${f.page || "MyAlgoAgent"}`,
      status: f.status,
      at: f.lastActivityAt,
      messages: [{ id: `${f.id}-first`, author: "USER" as const, authorName: name, body: f.message, createdAt: f.createdAt }, ...f.messages] as ThreadMessage[],
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        icon={LifeBuoy}
        description="Your conversations with our team — support requests and the feedback you've sent. Replies show up here and in your email."
      />

      <details className="surface group p-5" open={allCount === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-brand-navy">
          <span className="inline-flex items-center gap-2">
            <MessageSquareText size={16} className="text-brand-primary" /> Ask for help
          </span>
          <span className="text-xs font-medium text-brand-primary group-open:hidden">New request</span>
        </summary>
        <div className="mt-4 max-w-2xl">
          <SupportForm initialEmail={session.user?.email ?? ""} />
        </div>
      </details>

      {allCount === 0 ? (
        <p className="text-sm text-brand-navy/55">No conversations yet. Anything you send us — here or with the feedback button — will appear on this page with our replies.</p>
      ) : (
        <>
        <ListToolbar
          params={params}
          search={{ placeholder: "Search your conversations…" }}
          selects={[
            { name: "status", label: "Status", options: [{ value: "all", label: "Any" }, { value: "OPEN", label: STATUS.OPEN.label }, { value: "PENDING", label: STATUS.PENDING.label }, { value: "RESOLVED", label: STATUS.RESOLVED.label }] },
            { name: "kind", label: "Type", options: [{ value: "all", label: "Requests & feedback" }, { value: "case", label: "Support requests" }, { value: "feedback", label: "Feedback" }] },
          ]}
        />
        {threads.length === 0 && <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">No conversations match.</p>}
        <ul className="space-y-3">
          {threads.map((t) => {
            const s = STATUS[t.status];
            const staffReplies = t.messages.filter((m) => m.author === "STAFF").length;
            return (
              <li key={`${t.kind}-${t.id}`} id={`${t.kind}-${t.id}`}>
                <details className="surface group overflow-hidden" open={open === `${t.kind}-${t.id}`}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 hover:bg-brand-bg/60">
                    <span className="font-mono text-[11px] text-brand-navy/45">{t.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-navy">{t.topic}</span>
                    {staffReplies > 0 && <span className="text-xs text-brand-navy/50">{staffReplies} repl{staffReplies === 1 ? "y" : "ies"}</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                  </summary>
                  <div className="border-t border-black/[0.05] bg-brand-bg/40 px-5 py-4">
                    <SupportThread messages={t.messages} viewer="user" />
                    <SupportReplyBox kind={t.kind} id={t.id} resolved={t.status === "RESOLVED"} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <Pager basePath="/app/support" params={params} window={win} />
        </>
      )}
    </div>
  );
}
