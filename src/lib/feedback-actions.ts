"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { sendFeedbackNotice, sendSupportCaseNotice, sendSupportCaseConfirmation } from "@/lib/email";

export async function submitFeedbackAction(
  page: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false, error: "Not signed in." };
  if (!message.trim()) return { ok: false, error: "Enter some feedback first." };

  try {
    await enforceRateLimit(`feedback:${session.user.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  await prisma.feedback.create({
    data: { userId: session.user.id, page, message: message.trim() },
  });
  await sendFeedbackNotice(page, message.trim(), session.user.email).catch(() => {});

  return { ok: true };
}

export async function submitSupportCaseAction(input: {
  email: string;
  subject: string;
  message: string;
}): Promise<{ ok: true; caseId: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  if (!input.message.trim()) return { ok: false, error: "Message is required." };

  try {
    await enforceRateLimit(`support-case:${email}`, 5, 60 * 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const session = await auth();

  const supportCase = await prisma.supportCase.create({
    data: {
      userId: session?.user?.id ?? null,
      email,
      subject: input.subject.trim(),
      message: input.message.trim(),
    },
  });

  const caseId = `MAA-${supportCase.caseNumber + 100000}`;

  await sendSupportCaseNotice(caseId, input.subject.trim(), input.message.trim(), email).catch(() => {});
  await sendSupportCaseConfirmation(email, caseId).catch(() => {});

  return { ok: true, caseId };
}
