import "server-only";
import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { caseRef, feedbackRef, type TicketKind } from "@/lib/support/tickets";
import { BUILT_IN_OWNER_EMAILS } from "@/lib/admin/access";

export type InboxRow = {
  kind: TicketKind;
  id: string;
  ref: string;
  topic: string;
  snippet: string;
  from: string;
  userId: string | null;
  status: TicketStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assigneeId: string | null;
  tags: string[];
  lastActivityAt: Date;
  createdAt: Date;
  replies: number;
  lastAuthor: "USER" | "STAFF" | "NOTE" | null;
};

export type InboxFilter = { view: "open" | "pending" | "resolved" | "all"; type: "all" | "case" | "feedback"; q: string; mine: boolean; staffId: string };

const STATUS_OF: Record<InboxFilter["view"], TicketStatus[] | null> = { open: ["OPEN"], pending: ["PENDING"], resolved: ["RESOLVED"], all: null };

export async function inboxRows(f: InboxFilter): Promise<InboxRow[]> {
  const statuses = STATUS_OF[f.view];
  const q = f.q.trim();
  const caseNo = /^MAA-(\d+)$/i.exec(q);
  const fbRef = /^FB-([A-Z0-9]{6})$/i.exec(q);

  const common = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(f.mine ? { assigneeId: f.staffId } : {}),
  };
  const caseWhere: Prisma.SupportCaseWhereInput = {
    ...common,
    ...(caseNo ? { caseNumber: Number(caseNo[1]) - 100000 } : q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const fbWhere: Prisma.FeedbackWhereInput = {
    ...common,
    ...(fbRef ? { id: { endsWith: fbRef[1].toLowerCase() } } : q ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { page: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const lastMsg = { orderBy: { createdAt: "desc" as const }, take: 1, select: { author: true } };

  const [cases, feedback] = await Promise.all([
    f.type === "feedback" || fbRef
      ? []
      : prisma.supportCase.findMany({ where: caseWhere, orderBy: { lastActivityAt: "desc" }, take: 200, include: { user: { select: { name: true } }, messages: lastMsg, _count: { select: { messages: { where: { author: "STAFF" } } } } } }),
    f.type === "case" || caseNo
      ? []
      : prisma.feedback.findMany({ where: fbWhere, orderBy: { lastActivityAt: "desc" }, take: 200, include: { user: { select: { name: true, email: true } }, messages: lastMsg, _count: { select: { messages: { where: { author: "STAFF" } } } } } }),
  ]);

  const rows: InboxRow[] = [
    ...cases.map((c) => ({
      kind: "case" as const,
      id: c.id,
      ref: caseRef(c.caseNumber),
      topic: c.subject,
      snippet: c.message.slice(0, 160),
      from: c.user?.name ? `${c.user.name} · ${c.email}` : c.email,
      userId: c.userId,
      status: c.status,
      priority: c.priority,
      assigneeId: c.assigneeId,
      tags: c.tags,
      lastActivityAt: c.lastActivityAt,
      createdAt: c.createdAt,
      replies: c._count.messages,
      lastAuthor: c.messages[0]?.author ?? null,
    })),
    ...feedback.map((x) => ({
      kind: "feedback" as const,
      id: x.id,
      ref: feedbackRef(x.id),
      topic: `Feedback on ${x.page || "the app"}`,
      snippet: x.message.slice(0, 160),
      from: x.user.name ? `${x.user.name} · ${x.user.email}` : x.user.email,
      userId: x.userId,
      status: x.status,
      priority: x.priority,
      assigneeId: x.assigneeId,
      tags: x.tags,
      lastActivityAt: x.lastActivityAt,
      createdAt: x.createdAt,
      replies: x._count.messages,
      lastAuthor: x.messages[0]?.author ?? null,
    })),
  ];
  const weight = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  // Needs-reply views: most urgent first, then longest waiting. Others: newest activity first.
  return f.view === "open"
    ? rows.sort((a, b) => weight[a.priority] - weight[b.priority] || a.lastActivityAt.getTime() - b.lastActivityAt.getTime())
    : rows.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

export async function inboxCounts() {
  const [co, cp, fo, fp] = await Promise.all([
    prisma.supportCase.count({ where: { status: "OPEN" } }),
    prisma.supportCase.count({ where: { status: "PENDING" } }),
    prisma.feedback.count({ where: { status: "OPEN" } }),
    prisma.feedback.count({ where: { status: "PENDING" } }),
  ]);
  return { open: co + fo, pending: cp + fp };
}

export async function teamMembers() {
  const rows = await prisma.user.findMany({ where: { OR: [{ adminRole: { not: null } }, { email: { in: BUILT_IN_OWNER_EMAILS } }] }, select: { id: true, name: true, email: true, adminRole: true }, orderBy: { email: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name ?? r.email, email: r.email, role: r.adminRole ?? ("OWNER" as const) }));
}
