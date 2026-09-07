"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function setAgentNameAction(
  name: string
): Promise<{ ok: true; agentName: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return { ok: false, error: "Give your agent a name first." };

  await prisma.user.update({ where: { id: session.user.id }, data: { agentName: trimmed } });
  revalidatePath("/app", "layout");
  return { ok: true, agentName: trimmed };
}

export async function completeTutorialAction(): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { tutorialCompletedAt: new Date() },
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}
