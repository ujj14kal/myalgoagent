"use server";

import bcrypt from "bcryptjs";
import { LIMITS, oneLine, text, tooLong } from "@/lib/text";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";
import { isValidUsername } from "@/lib/username";

export async function updateProfileAction(input: {
  fullName: string;
  username: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const username = text(input?.username).toLowerCase();
  const fullName = oneLine(input?.fullName, LIMITS.fullName + 1);
  const phone = text(input?.phone);
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (tooLong(fullName, LIMITS.fullName)) return { ok: false, error: `Full name must be ${LIMITS.fullName} characters or fewer.` };
  if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) return { ok: false, error: "Enter a valid phone number." };
  if (!isValidUsername(username)) {
    return { ok: false, error: "Username must be 3-20 characters: lowercase letters, numbers, underscores." };
  }

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing && existing.id !== session.user.id) {
    return { ok: false, error: "That username is taken." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: fullName, username, phone: phone || null },
  });
  revalidatePath("/app/account");
  return { ok: true };
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  try {
    await enforceRateLimit(`change-password:${session.user.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  if (input.newPassword !== input.confirmPassword) return { ok: false, error: "Passwords do not match." };
  if (!isPasswordValid(input.newPassword)) return { ok: false, error: "Password does not meet the requirements below." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.passwordHash) {
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
  return { ok: true };
}

export async function signOutOtherSessionsAction(): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  const useSecureCookies = process.env.NODE_ENV === "production";
  const cookieName = useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token";
  const currentToken = (await cookies()).get(cookieName)?.value ?? "";

  await prisma.session.deleteMany({
    where: { userId: session.user.id, sessionToken: { not: currentToken } },
  });
  return { ok: true };
}
