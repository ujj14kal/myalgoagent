import "server-only";
import type { SupportAuthor, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import { sendSupportReplyEmail } from "@/lib/email";
import { logError } from "@/lib/logger";

// Support cases and feedback share one conversation model: the first message
// lives on the case/feedback row, everything after it in SupportMessage.
// Staff replies reach the user in the app (a notification + their Support
// page) and by email; internal notes never leave the admin portal.

export type TicketKind = "case" | "feedback";
export const caseRef = (caseNumber: number) => `MAA-${caseNumber + 100000}`;
export const feedbackRef = (id: string) => `FB-${id.slice(-6).toUpperCase()}`;
export const MAX_REPLY = 5_000;

export type TicketHead = {
  kind: TicketKind;
  id: string;
  ref: string;
  topic: string;
  userId: string | null;
  email: string;
  status: TicketStatus;
};

/**
 * Requests sent while signed out, or by email, carry only an address. When that address belongs to an account, attach them to
 * it, so they show on that person's Support page and our replies reach them there as well as by email.
 */
export async function linkCasesToAccount(userId: string, email: string | null | undefined) {
  if (!email) return;
  await prisma.supportCase.updateMany({ where: { userId: null, email: { equals: email, mode: "insensitive" } }, data: { userId } });
}

async function accountIdFor(email: string): Promise<string | null> {
  const u = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return u?.id ?? null;
}

export async function ticketHead(kind: TicketKind, id: string): Promise<TicketHead | null> {
  if (kind === "case") {
    const c = await prisma.supportCase.findUnique({ where: { id }, select: { id: true, caseNumber: true, subject: true, userId: true, email: true, status: true } });
    if (!c) return null;
    let userId = c.userId;
    if (!userId) {
      userId = await accountIdFor(c.email);
      if (userId) await prisma.supportCase.update({ where: { id: c.id }, data: { userId } });
    }
    return { kind, id: c.id, ref: caseRef(c.caseNumber), topic: c.subject, userId, email: c.email, status: c.status };
  }
  const f = await prisma.feedback.findUnique({ where: { id }, select: { id: true, page: true, userId: true, status: true, user: { select: { email: true } } } });
  return f && { kind, id: f.id, ref: feedbackRef(f.id), topic: `Your feedback on ${f.page || "MyAlgoAgent"}`, userId: f.userId, email: f.user.email, status: f.status };
}

/** Where one conversation opens in the app (signing in first when needed). */
export const threadLink = (kind: TicketKind, id: string) => `${siteUrl}/app/support?open=${kind}-${id}`;

const threadUrl = (t: TicketHead) => (t.userId ? `${siteUrl}/app/support?open=${t.kind}-${t.id}` : null);

async function addMessage(t: TicketHead, author: SupportAuthor, authorId: string | null, authorName: string, body: string, status: TicketStatus | undefined) {
  const msg = await prisma.supportMessage.create({
    data: { caseId: t.kind === "case" ? t.id : null, feedbackId: t.kind === "feedback" ? t.id : null, author, authorId, authorName, body },
  });
  const data = { lastActivityAt: new Date(), ...(status ? { status } : {}) };
  if (t.kind === "case") await prisma.supportCase.update({ where: { id: t.id }, data });
  else await prisma.feedback.update({ where: { id: t.id }, data });
  return msg;
}

/**
 * A reply from our team: saved to the thread, shown to the user in the app,
 * and emailed. Returns how the email went ("sent" / "failed: …" / "skipped").
 */
export async function postStaffReply(
  t: TicketHead,
  staff: { id: string; name: string },
  body: string,
  opts: { email: boolean; status: TicketStatus },
): Promise<{ emailStatus: string }> {
  const msg = await addMessage(t, "STAFF", staff.id, staff.name, body, opts.status);
  if (t.userId) {
    await prisma.notification.create({
      data: {
        userId: t.userId,
        type: "SUPPORT_REPLY",
        message: `Our support team replied to ${t.ref}: “${body.length > 110 ? `${body.slice(0, 110)}…` : body}”`,
        link: `/app/support?open=${t.kind}-${t.id}`,
      },
    });
  }
  let emailStatus = "skipped";
  if (opts.email) {
    try {
      await sendSupportReplyEmail(t.email, { ref: t.ref, topic: t.topic, body, staffName: staff.name.split(" ")[0] || "The team", threadUrl: threadUrl(t) });
      emailStatus = "sent";
    } catch (err) {
      logError("support.reply-email", err, { ref: t.ref });
      emailStatus = `failed: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}`;
    }
  }
  await prisma.supportMessage.update({ where: { id: msg.id }, data: { emailStatus } });
  return { emailStatus };
}

/** An internal note: visible to staff only. */
export async function postNote(t: TicketHead, staff: { id: string; name: string }, body: string) {
  await addMessage(t, "NOTE", staff.id, staff.name, body, undefined);
}

/** The user writing back from their Support page — reopens the conversation for our team. */
export async function postUserReply(t: TicketHead, user: { id: string; name: string }, body: string) {
  await addMessage(t, "USER", user.id, user.name, body, "OPEN");
}
