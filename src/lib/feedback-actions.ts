"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { sendFeedbackNotice, sendSupportCaseNotice, sendSupportCaseConfirmation } from "@/lib/email";
import { LIMITS, oneLine, text, tooLong } from "@/lib/text";

export async function submitFeedbackAction(
  rawPage: string,
  rawMessage: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false, error: "Not signed in." };
  const page = oneLine(rawPage, LIMITS.page);
  const message = text(rawMessage);
  if (!message) return { ok: false, error: "Enter some feedback first." };
  if (tooLong(message, LIMITS.feedback)) return { ok: false, error: `Please keep feedback under ${LIMITS.feedback.toLocaleString("en-IN")} characters.` };

  try {
    await enforceRateLimit(`feedback:${session.user.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  await prisma.feedback.create({
    data: { userId: session.user.id, page, message },
  });
  await sendFeedbackNotice(page, message, session.user.email).catch((err) => console.error("sendFeedbackNotice failed:", err));

  return { ok: true };
}

export async function submitSupportCaseAction(input: {
  email: string;
  subject: string;
  message: string;
}): Promise<{ ok: true; caseId: string } | { ok: false; error: string }> {
  const email = text(input?.email).toLowerCase();
  const subject = oneLine(input?.subject, LIMITS.supportSubject + 1);
  const message = text(input?.message);
  if (tooLong(email, LIMITS.email) || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!subject) return { ok: false, error: "Subject is required." };
  if (tooLong(subject, LIMITS.supportSubject)) return { ok: false, error: `Please keep the subject under ${LIMITS.supportSubject} characters.` };
  if (!message) return { ok: false, error: "Message is required." };
  if (tooLong(message, LIMITS.supportMessage)) return { ok: false, error: `Please keep the message under ${LIMITS.supportMessage.toLocaleString("en-IN")} characters.` };

  // Open to signed-out visitors, so limit per IP as well as per address — rotating
  // addresses mustn't be a way to flood the inbox or send our emails to strangers.
  const ip = await clientIp();
  try {
    await enforceRateLimit(`support-case-ip:${ip}`, 10, 60 * 60_000);
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
      subject,
      message,
    },
  });

  const caseId = `MAA-${supportCase.caseNumber + 100000}`;

  await sendSupportCaseNotice(caseId, subject, message, email).catch((err) => console.error("sendSupportCaseNotice failed:", err));
  await sendSupportCaseConfirmation(email, caseId).catch((err) => console.error("sendSupportCaseConfirmation failed:", err));

  return { ok: true, caseId };
}
