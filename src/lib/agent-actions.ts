"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";

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

export async function resetAgentNameAction(): Promise<{ ok: true; agentName: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await prisma.user.update({ where: { id: session.user.id }, data: { agentName: null } });
  revalidatePath("/app", "layout");
  return { ok: true, agentName: DEFAULT_AGENT_NAME };
}

export type NotificationPrefs = { notifyOrderFilled: boolean; notifySignalAlert: boolean };

export async function setNotificationPrefsAction(
  prefs: NotificationPrefs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notifyOrderFilled: prefs.notifyOrderFilled, notifySignalAlert: prefs.notifySignalAlert },
  });
  revalidatePath("/app/agent-settings");
  return { ok: true };
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
