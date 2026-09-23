"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";

export async function setAgentNameAction(
  name: string
): Promise<{ ok: true; agentName: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`agent-settings:${session.user.id}`, 30, 60_000);
  if (limited) return { ok: false, error: limited };

  const trimmed = typeof name === "string" ? name.trim().slice(0, 24) : "";
  if (!trimmed) return { ok: false, error: "Give your agent a name first." };

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { agentName: trimmed } });
  } catch (err) {
    logError("agent-actions:setAgentName", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't save the name — please try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, agentName: trimmed };
}

export async function resetAgentNameAction(): Promise<{ ok: true; agentName: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`agent-settings:${session.user.id}`, 30, 60_000);
  if (limited) return { ok: false, error: limited };

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { agentName: null } });
  } catch (err) {
    logError("agent-actions:resetAgentName", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't reset the name — please try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, agentName: DEFAULT_AGENT_NAME };
}

export type NotificationPrefs = { notifyOrderFilled: boolean; notifySignalAlert: boolean };

export async function setNotificationPrefsAction(
  prefs: NotificationPrefs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`agent-settings:${session.user.id}`, 30, 60_000);
  if (limited) return { ok: false, error: limited };

  if (typeof prefs?.notifyOrderFilled !== "boolean" || typeof prefs?.notifySignalAlert !== "boolean") {
    return { ok: false, error: "Invalid notification settings." };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { notifyOrderFilled: prefs.notifyOrderFilled, notifySignalAlert: prefs.notifySignalAlert },
    });
  } catch (err) {
    logError("agent-actions:setNotificationPrefs", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't save your preferences — please try again." };
  }
  revalidatePath("/app/agent-settings");
  return { ok: true };
}

export async function completeTutorialAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { tutorialCompletedAt: new Date() },
    });
  } catch (err) {
    logError("agent-actions:completeTutorial", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't record tutorial completion." };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}
