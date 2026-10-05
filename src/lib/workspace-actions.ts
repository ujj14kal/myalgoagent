"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { emptyDefinition, parseDefinition } from "@/lib/workspace/definition";
import { checkDefinition, publishVersion } from "@/lib/workspace/store";
import type { WorkspaceIssue } from "@/lib/workspace/types";

// Server Actions for workspaces. Failures come back as plain data ({ error }), never thrown: Next.js hides the text of
// errors thrown across a Server Action in production.

type Err = { error: string };
const MAX_NAME = 80;

const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) : "");

async function who(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createWorkspace(input: { name: string; description?: string; instrumentId?: string }): Promise<{ id: string } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const name = cleanName(input?.name);
  if (!name) return { error: "Give the workspace a name." };
  try {
    await enforceRateLimit(`workspace-write:${userId}`, 30, 60_000);
    if ((await prisma.workspace.count({ where: { userId } })) >= 200) return { error: "You have reached the limit of 200 workspaces. Archive or delete some first." };
    const ws = await prisma.workspace.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), description: input.description?.trim().slice(0, 500) || null, draft: emptyDefinition(input.instrumentId ?? "") as unknown as Prisma.InputJsonValue },
    });
    revalidatePath("/app/workspaces");
    return { id: ws.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function saveWorkspaceDraft(id: string, input: { name?: string; description?: string | null; draft: unknown }): Promise<{ ok: true } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  try {
    await enforceRateLimit(`workspace-write:${userId}`, 60, 60_000);
    const ws = await prisma.workspace.findFirst({ where: { id, userId }, select: { id: true, status: true } });
    if (!ws) return { error: "Workspace not found." };
    const def = parseDefinition(input.draft);
    if (!def) return { error: "The plan is too large or isn't valid. Remove some rules and try again." };
    const data: Prisma.WorkspaceUpdateInput = { draft: def as unknown as Prisma.InputJsonValue };
    if (input.name !== undefined) {
      const name = cleanName(input.name);
      if (!name) return { error: "Give the workspace a name." };
      data.name = name;
      data.nameNormalized = name.toLowerCase();
    }
    if (input.description !== undefined) data.description = input.description?.trim().slice(0, 500) || null;
    await prisma.workspace.update({ where: { id }, data });
    revalidatePath(`/app/workspaces/${id}`);
    revalidatePath("/app/workspaces");
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: "DUPLICATE_NAME" };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export type WorkspaceCheck = { errors: WorkspaceIssue[]; warnings: WorkspaceIssue[]; entryText: string; exitText: string };

/** Checks a plan (the stored draft, or one being edited) without saving anything. */
export async function checkWorkspace(draft: unknown): Promise<WorkspaceCheck | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  try {
    await enforceRateLimit(`workspace-check:${userId}`, 60, 60_000);
    const def = parseDefinition(draft);
    if (!def) return { error: "The plan is too large or isn't valid." };
    const c = await checkDefinition(userId, def);
    return { errors: c.errors, warnings: c.warnings, entryText: c.entryText, exitText: c.exitText };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function publishWorkspace(id: string, note?: string): Promise<{ ok: true; version: number; strategyId: string } | { ok: false; errors: WorkspaceIssue[] } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  try {
    const r = await publishVersion(userId, id, note);
    if (r.ok) {
      revalidatePath(`/app/workspaces/${id}`);
      revalidatePath("/app/workspaces");
      revalidatePath("/app/strategies");
    }
    return r;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function duplicateWorkspace(id: string): Promise<{ id: string } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  try {
    await enforceRateLimit(`workspace-write:${userId}`, 30, 60_000);
    const src = await prisma.workspace.findFirst({ where: { id, userId } });
    if (!src) return { error: "Workspace not found." };
    for (let n = 2; n < 50; n++) {
      const name = `${src.name.slice(0, MAX_NAME - 8)} (copy${n > 2 ? ` ${n - 1}` : ""})`;
      const taken = await prisma.workspace.findFirst({ where: { userId, nameNormalized: name.toLowerCase() }, select: { id: true } });
      if (taken) continue;
      const copy = await prisma.workspace.create({ data: { userId, name, nameNormalized: name.toLowerCase(), description: src.description, draft: src.draft as Prisma.InputJsonValue } });
      revalidatePath("/app/workspaces");
      return { id: copy.id };
    }
    return { error: "Couldn't find a free name for the copy." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/** Archive hides a workspace and stops it being published again; versions already published keep running until stopped on Live Trading. */
export async function setWorkspaceStatus(id: string, status: "ARCHIVED" | "ACTIVE"): Promise<{ ok: true } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const ws = await prisma.workspace.findFirst({ where: { id, userId }, select: { latestVersion: true } });
  if (!ws) return { error: "Workspace not found." };
  await prisma.workspace.update({ where: { id }, data: { status: status === "ARCHIVED" ? "ARCHIVED" : ws.latestVersion > 0 ? "ACTIVE" : "DRAFT" } });
  revalidatePath(`/app/workspaces/${id}`);
  revalidatePath("/app/workspaces");
  return { ok: true };
}

/** Deleting a workspace keeps the strategies it produced (they become ordinary strategies); it is refused while one of them is trading live. */
export async function deleteWorkspace(id: string): Promise<{ ok: true } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const ws = await prisma.workspace.findFirst({ where: { id, userId }, select: { id: true } });
  if (!ws) return { error: "Workspace not found." };
  const live = await prisma.liveDeployment.count({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] }, strategy: { workspaceVersion: { workspaceId: id } } } });
  if (live > 0) return { error: "A version of this workspace is trading live. Stop it on Live Trading first." };
  await prisma.workspace.delete({ where: { id } });
  revalidatePath("/app/workspaces");
  return { ok: true };
}
