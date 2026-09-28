"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Sign-in providers a signed-in user may link to their account.
const LINKABLE_PROVIDERS = new Set(["google"]);

export async function connectProviderAction(provider: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !LINKABLE_PROVIDERS.has(provider)) return;
  await signIn(provider, { redirectTo: "/app/account" });
}

/** The signed-in user's linked sign-in providers — always their own; never takes a user id from the caller. */
export async function getLinkedProviders(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const accounts = await prisma.account.findMany({ where: { userId: session.user.id }, select: { provider: true } });
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
