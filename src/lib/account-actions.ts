"use server";

import { randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createSessionForUser } from "@/lib/session-cookie";
import { reactivateIfPending } from "@/lib/account-status";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";
import { isUsernameAvailable, isValidUsername, suggestUsernames } from "@/lib/username";
import { sendWelcomeEmail, sendPasswordResetEmail, sendMagicLinkEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";

const baseUrl = process.env.AUTH_URL ?? siteUrl;

export interface SignupInput {
  fullName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export async function checkUsernameAction(username: string): Promise<{ available: boolean; suggestions: string[] }> {
  await enforceRateLimit(`username-check:${username.slice(0, 40)}`, 20, 60_000);
  const available = await isUsernameAvailable(username);
  const suggestions = available ? [] : await suggestUsernames(username);
  return { available, suggestions };
}

export async function signupAction(input: SignupInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();

  try {
    await enforceRateLimit(`signup:${email}`, 5, 60 * 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  if (!input.fullName.trim()) return { ok: false, error: "Full name is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!input.phone.trim()) return { ok: false, error: "Phone number is required." };
  if (!isValidUsername(username)) {
    return { ok: false, error: "Username must be 3-20 characters: lowercase letters, numbers, underscores." };
  }
  if (input.password !== input.confirmPassword) return { ok: false, error: "Passwords do not match." };
  if (!isPasswordValid(input.password)) {
    return { ok: false, error: "Password does not meet the requirements below." };
  }

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);
  if (emailTaken) return { ok: false, error: "An account with this email already exists." };
  if (usernameTaken) return { ok: false, error: "That username was just taken — try another." };

  const passwordHash = await bcrypt.hash(input.password, 12);
  const twoFactorRequiredBy = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      name: input.fullName.trim(),
      email,
      phone: input.phone.trim(),
      username,
      passwordHash,
      twoFactorRequiredBy,
    },
  });

  await sendWelcomeEmail(email, input.fullName.trim()).catch(() => {});

  await createSessionForUser(user.id);

  return { ok: true };
}

export async function loginWithPasswordAction(
  usernameInput: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = usernameInput.trim().toLowerCase();

  try {
    await enforceRateLimit(`login-password:${username}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user?.passwordHash) return { ok: false, error: "Incorrect username or password." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Incorrect username or password." };

  await reactivateIfPending(user.id);
  await createSessionForUser(user.id);
  return { ok: true };
}

export async function requestPasswordResetAction(email: string): Promise<{ ok: true }> {
  const normalized = email.trim().toLowerCase();
  await enforceRateLimit(`password-reset-request:${normalized}`, 5, 60 * 60_000).catch(() => {});

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Always return ok — never reveal whether an email exists.
  if (!user || !user.passwordHash) return { ok: true };

  const rawToken = randomUUID();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) },
  });

  const resetUrl = `${baseUrl}/reset-password/${rawToken}`;
  await sendPasswordResetEmail(normalized, resetUrl).catch(() => {});
  return { ok: true };
}

export async function resetPasswordAction(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password !== confirmPassword) return { ok: false, error: "Passwords do not match." };
  if (!isPasswordValid(password)) return { ok: false, error: "Password does not meet the requirements below." };

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return { ok: true };
}

export async function completeUsernameAction(username: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const normalized = username.trim().toLowerCase();
  if (!isValidUsername(normalized)) {
    return { ok: false, error: "Username must be 3-20 characters: lowercase letters, numbers, underscores." };
  }
  const available = await isUsernameAvailable(normalized);
  if (!available) return { ok: false, error: "That username is taken." };

  await prisma.user.update({ where: { id: session.user.id }, data: { username: normalized } });
  return { ok: true };
}

export async function requestMagicLinkAction(email: string): Promise<{ ok: true }> {
  const normalized = email.trim().toLowerCase();
  await enforceRateLimit(`magic-link-request:${normalized}`, 5, 60 * 60_000).catch(() => {});

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return { ok: true }; // never reveal whether an email exists

  const rawToken = randomUUID();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prisma.verificationToken.create({
    data: { identifier: normalized, token: tokenHash, expires: new Date(Date.now() + 15 * 60_000) },
  });

  const url = `${baseUrl}/api/auth/magic-link?token=${rawToken}&email=${encodeURIComponent(normalized)}`;
  await sendMagicLinkEmail(normalized, url).catch(() => {});
  return { ok: true };
}
