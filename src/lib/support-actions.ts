"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { postUserReply, ticketHead, MAX_REPLY, type TicketKind } from "@/lib/support/tickets";
import { sendFeedbackNotice, sendSupportCaseNotice } from "@/lib/email";
import { text } from "@/lib/text";
import { logError } from "@/lib/logger";

// The user's side of a support conversation: replying to our team and
// marking a conversation solved. Only ever on their own cases and feedback.

type Result = { ok: true } | { ok: false; error: string };

async function mine(kind: TicketKind, id: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || (kind !== "case" && kind !== "feedback")) return null;
  const t = await ticketHead(kind, id);
  if (!t || t.userId !== userId) return null;
  return { t, userId, name: session.user?.name ?? session.user?.email ?? "You", email: session.user?.email ?? t.email };
}

export async function replyToMySupportThread(kind: TicketKind, id: string, rawBody: string): Promise<Result> {
  const body = text(rawBody);
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_REPLY) return { ok: false, error: `Please keep it under ${MAX_REPLY.toLocaleString("en-IN")} characters.` };
  const m = await mine(kind, id);
  if (!m) return { ok: false, error: "That conversation isn't available." };
  try {
    await enforceRateLimit(`support-reply:${m.userId}`, 20, 10 * 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
  await postUserReply(m.t, { id: m.userId, name: m.name }, body);
  // Let the team know by email too (the admin inbox shows it either way).
  const notice = kind === "case" ? sendSupportCaseNotice(m.t.ref, `Reply: ${m.t.topic}`, body, m.email) : sendFeedbackNotice(`${m.t.ref} (reply)`, body, m.email);
  await notice.catch((err) => logError("support.user-reply-notice", err));
  revalidatePath("/app/support");
  return { ok: true };
}

export async function markMySupportThreadSolved(kind: TicketKind, id: string): Promise<Result> {
  const m = await mine(kind, id);
  if (!m) return { ok: false, error: "That conversation isn't available." };
  const data = { status: "RESOLVED" as const, lastActivityAt: new Date() };
  if (kind === "case") await prisma.supportCase.update({ where: { id }, data });
  else await prisma.feedback.update({ where: { id }, data });
  revalidatePath("/app/support");
  return { ok: true };
}
