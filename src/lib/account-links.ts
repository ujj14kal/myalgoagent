"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function connectProviderAction(provider: string): Promise<void> {
  await signIn(provider, { redirectTo: "/app/account" });
}

export async function getLinkedProviders(userId: string): Promise<string[]> {
  const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true } });
  return accounts.map((a) => a.provider);
}

export async function unlinkAccountAction(
  provider: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } }),
    prisma.account.findMany({ where: { userId: session.user.id } }),
  ]);

  const target = accounts.find((a) => a.provider === provider);
  if (!target) return { ok: false, error: "That account isn't linked." };

  const wouldHaveNoSignIn = !user?.passwordHash && accounts.length <= 1;
  if (wouldHaveNoSignIn) {
    return {
      ok: false,
      error: "Set a password or link another account before unlinking this one — otherwise you'd be locked out.",
    };
  }

  await prisma.account.delete({
    where: { provider_providerAccountId: { provider: target.provider, providerAccountId: target.providerAccountId } },
  });
  revalidatePath("/app/account");
  return { ok: true };
}
