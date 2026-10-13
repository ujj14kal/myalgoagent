import "server-only";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { sendInboundAck } from "@/lib/email";
import { logError } from "@/lib/logger";
import { caseRef, MAX_REPLY, threadLink } from "@/lib/support/tickets";
import { caseNumberIn, cleanSubject, freshText, isAutomated } from "./inbound-parse";

// Mail that people send to the no-reply address (or reply to our support emails) becomes a support case, or a new message on
// the case named in the subject. Staff then see it in the admin inbox like any other request.

export type Inbound = { from: string; name: string; subject: string; text: string; messageId: string; headers: Record<string, string> };
export type InboundResult = { action: "ignored"; why: string } | { action: "created" | "added"; ref: string };

async function allowed(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    await enforceRateLimit(key, max, windowMs);
    return true;
  } catch (err) {
    if (err instanceof RateLimitError) return false;
    throw err;
  }
}

export async function handleInbound(m: Inbound): Promise<InboundResult> {
  const from = m.from.trim().toLowerCase();
  if (!from.includes("@") || isAutomated(from, m.headers)) return { action: "ignored", why: "automatic or own mail" };
  // Each message once (SNS may deliver twice), and no one can flood the inbox.
  if (m.messageId && !(await allowed(`inbound-msg:${m.messageId}`, 1, 7 * 86_400_000))) return { action: "ignored", why: "already handled" };
  if (!(await allowed(`inbound-from:${from}`, 10, 3_600_000))) return { action: "ignored", why: "too many from this sender" };

  const body = (freshText(m.text) || m.text.trim()).slice(0, MAX_REPLY);
  if (!body) return { action: "ignored", why: "empty" };
  const name = m.name.trim() || from;
  const user = await prisma.user.findFirst({ where: { email: { equals: from, mode: "insensitive" } }, select: { id: true } });

  // A reply that names a case we know, from the person who raised it, joins that case and reopens it.
  const n = caseNumberIn(m.subject);
  if (n) {
    const c = await prisma.supportCase.findUnique({ where: { caseNumber: n }, select: { id: true, caseNumber: true, subject: true, email: true, userId: true } });
    if (c && (c.email.toLowerCase() === from || (user && c.userId === user.id))) {
      await prisma.supportMessage.create({ data: { caseId: c.id, author: "USER", authorId: user?.id ?? null, authorName: name, body } });
      await prisma.supportCase.update({ where: { id: c.id }, data: { status: "OPEN", lastActivityAt: new Date() } });
      await sendInboundAck(from, caseRef(c.caseNumber), c.subject, true, user ? threadLink("case", c.id) : null).catch((err) => logError("support.inbound-ack", err, { ref: caseRef(c.caseNumber) }));
      return { action: "added", ref: caseRef(c.caseNumber) };
    }
  }

  const created = await prisma.supportCase.create({ data: { userId: user?.id ?? null, email: from, subject: cleanSubject(m.subject), message: body } });
  const ref = caseRef(created.caseNumber);
  await sendInboundAck(from, ref, created.subject, false, user ? threadLink("case", created.id) : null).catch((err) => logError("support.inbound-ack", err, { ref }));
  return { action: "created", ref };
}
