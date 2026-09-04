"use server";

import { randomInt, createHash } from "crypto";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { sendOtpEmail, sendDeletionConfirmedEmail } from "@/lib/email";

const DELETION_WINDOW_DAYS = 15;
const OTP_EXPIRY_MS = 10 * 60_000;
const CONFIRMATION_PHRASE = "delete-my-account";

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function requestAccountDeletionAction(
  confirmationText: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false, error: "Not signed in." };

  if (confirmationText.trim() !== CONFIRMATION_PHRASE) {
    return { ok: false, error: `Type "${CONFIRMATION_PHRASE}" exactly to continue.` };
  }

  try {
    await enforceRateLimit(`account-deletion-request:${session.user.id}`, 5, 60 * 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const code = generateOtp();
  await prisma.otpCode.create({
    data: {
      userId: session.user.id,
      purpose: "ACCOUNT_DELETION",
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    },
  });

  await sendOtpEmail(session.user.email, code, "account deletion");
  return { ok: true };
}

export async function confirmAccountDeletionAction(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false, error: "Not signed in." };

  try {
    await enforceRateLimit(`account-deletion-verify:${session.user.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const otp = await prisma.otpCode.findFirst({
    where: { userId: session.user.id, purpose: "ACCOUNT_DELETION", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) {
    return { ok: false, error: "This code has expired — request a new one." };
  }
  if (otp.attempts >= 5) {
    return { ok: false, error: "Too many incorrect attempts — request a new code." };
  }
  if (otp.codeHash !== hashOtp(code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "Incorrect code." };
  }

  const deletionScheduledFor = new Date(Date.now() + DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { status: "PENDING_DELETION", deletionRequestedAt: new Date(), deletionScheduledFor },
    }),
    prisma.session.deleteMany({ where: { userId: session.user.id } }),
  ]);

  await sendDeletionConfirmedEmail(session.user.email, deletionScheduledFor).catch(() => {});

  await signOut({ redirect: false });
  return { ok: true };
}
