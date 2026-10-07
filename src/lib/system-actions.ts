"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { blockProblems, conceptProblems, describeConcept } from "@/lib/system/compile";
import { conceptBlockIds, parseBlockDefinition, parseConceptClass, parseConceptDefinition, parseSystemDefinition } from "@/lib/system/definition";
import type { BlockDefinition, SystemIssue } from "@/lib/system/types";

// Server Actions for the workspace's first two layers: blocks (reusable market components) and concepts (blocks
// combined into a bullish or bearish setup). Failures come back as plain data ({ error }), never thrown.

type Err = { error: string };
const MAX_NAME = 80;
const MAX_ITEMS = 500;
const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) : "");
const cleanText = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) || null : null);

async function who(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const refresh = () => revalidatePath("/app/workspaces");

// ---------- blocks ----------

export type BlockSaveResult = { id: string; issues: SystemIssue[] } | Err;

/** Creates (no id) or updates a block. A block is one rule and nothing else: no instrument, side, size or exits. */
export async function saveBlock(input: { id?: string; name: string; description?: string | null; definition: unknown }): Promise<BlockSaveResult> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const name = cleanName(input?.name);
  if (!name) return { error: "Give the block a name, e.g. “My BOS”." };
  const def = parseBlockDefinition(input.definition);
  if (!def) return { error: "The block's rule isn't valid, or it reads another instrument. A block is only a market component — the trading system chooses the instrument." };
  const issues = blockProblems(def, name);
  try {
    await enforceRateLimit(`workspace-write:${userId}`, 60, 60_000);
    const data = { name, nameNormalized: name.toLowerCase(), description: cleanText(input.description), definition: def as unknown as Prisma.InputJsonValue };
    if (input.id) {
      const found = await prisma.block.findFirst({ where: { id: input.id, userId }, select: { id: true } });
      if (!found) return { error: "Block not found." };
      await prisma.block.update({ where: { id: input.id }, data });
      refresh();
      return { id: input.id, issues };
    }
    if ((await prisma.block.count({ where: { userId } })) >= MAX_ITEMS) return { error: `You have reached the limit of ${MAX_ITEMS} blocks. Delete some first.` };
    const b = await prisma.block.create({ data: { userId, ...data } });
    refresh();
    return { id: b.id, issues };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: `You already have a block called “${name}”. Choose a different name.` };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/** Concepts that use a block (by name), for the delete guard and the block page. */
async function conceptsUsingBlock(userId: string, blockId: string): Promise<string[]> {
  const concepts = await prisma.concept.findMany({ where: { userId }, select: { name: true, definition: true } });
  return concepts.filter((c) => conceptBlockIds(parseConceptDefinition(c.definition)?.logic ?? null).includes(blockId)).map((c) => c.name);
}

/** Refused while a concept uses the block (published versions keep their own copy, so they are never affected). */
export async function deleteBlock(id: string): Promise<{ ok: true } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const b = await prisma.block.findFirst({ where: { id, userId }, select: { id: true } });
  if (!b) return { error: "Block not found." };
  const users = await conceptsUsingBlock(userId, id);
  if (users.length) return { error: `This block is used by ${users.map((n) => `“${n}”`).join(", ")}. Remove it from ${users.length === 1 ? "that concept" : "those concepts"} first.` };
  await prisma.block.delete({ where: { id } });
  refresh();
  return { ok: true };
}

export async function duplicateBlock(id: string): Promise<{ id: string } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const src = await prisma.block.findFirst({ where: { id, userId } });
  if (!src) return { error: "Block not found." };
  for (let n = 1; n < 50; n++) {
    const name = `${src.name.slice(0, MAX_NAME - 10)} (copy${n > 1 ? ` ${n}` : ""})`;
    if (await prisma.block.findFirst({ where: { userId, nameNormalized: name.toLowerCase() }, select: { id: true } })) continue;
    const copy = await prisma.block.create({ data: { userId, name, nameNormalized: name.toLowerCase(), description: src.description, definition: src.definition as Prisma.InputJsonValue } });
    refresh();
    return { id: copy.id };
  }
  return { error: "Couldn't find a free name for the copy." };
}

// ---------- concepts ----------

export type ConceptSaveResult = { id: string; issues: SystemIssue[]; text: string } | Err;

async function blocksFor(userId: string, ids: string[]) {
  const rows = ids.length ? await prisma.block.findMany({ where: { userId, id: { in: ids } } }) : [];
  const out: Record<string, { name: string; definition: BlockDefinition }> = {};
  for (const r of rows) {
    const d = parseBlockDefinition(r.definition);
    if (d) out[r.id] = { name: r.name, definition: d };
  }
  return out;
}

/** Checks a concept being edited without saving: its blocks exist and its logic is complete. */
export async function checkConcept(definition: unknown): Promise<{ issues: SystemIssue[]; text: string } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const def = parseConceptDefinition(definition);
  if (!def) return { error: "The concept is too large or isn't valid." };
  const blocks = await blocksFor(userId, conceptBlockIds(def.logic));
  return { issues: conceptProblems(def, blocks), text: describeConcept(def, blocks) };
}

/**
 * Creates (no id) or updates a concept: blocks joined by connections, classified bullish or bearish. It only says
 * "setup valid" — instruments, sizes, exits and every trading decision belong to the trading system.
 */
export async function saveConcept(input: { id?: string; name: string; description?: string | null; classification: string; definition: unknown }): Promise<ConceptSaveResult> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const name = cleanName(input?.name);
  if (!name) return { error: "Give the concept a name, e.g. “My Bullish SMC Entry”." };
  const def = parseConceptDefinition(input.definition);
  if (!def) return { error: "The concept is too large or isn't valid." };
  const blocks = await blocksFor(userId, conceptBlockIds(def.logic));
  const issues = conceptProblems(def, blocks, name);
  try {
    await enforceRateLimit(`workspace-write:${userId}`, 60, 60_000);
    const data = { name, nameNormalized: name.toLowerCase(), description: cleanText(input.description), classification: parseConceptClass(input.classification), definition: def as unknown as Prisma.InputJsonValue };
    let id = input.id;
    if (id) {
      const found = await prisma.concept.findFirst({ where: { id, userId }, select: { id: true } });
      if (!found) return { error: "Concept not found." };
      await prisma.concept.update({ where: { id }, data });
    } else {
      if ((await prisma.concept.count({ where: { userId } })) >= MAX_ITEMS) return { error: `You have reached the limit of ${MAX_ITEMS} concepts. Delete some first.` };
      id = (await prisma.concept.create({ data: { userId, ...data } })).id;
    }
    refresh();
    return { id, issues, text: describeConcept(def, blocks) };
  } catch (err) {
    if (isUniqueConstraintViolation(err, "nameNormalized")) return { error: `You already have a concept called “${name}”. Choose a different name.` };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/** Refused while a trading system's draft uses the concept (published versions keep their own copy). */
export async function deleteConcept(id: string): Promise<{ ok: true } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const c = await prisma.concept.findFirst({ where: { id, userId }, select: { id: true } });
  if (!c) return { error: "Concept not found." };
  const systems = await prisma.workspace.findMany({ where: { userId }, select: { name: true, draft: true } });
  const users = systems.filter((s) => parseSystemDefinition(s.draft)?.concepts.some((x) => x.conceptId === id)).map((s) => s.name);
  if (users.length) return { error: `This concept is used by ${users.map((n) => `“${n}”`).join(", ")}. Remove it from ${users.length === 1 ? "that trading system" : "those trading systems"} first.` };
  await prisma.concept.delete({ where: { id } });
  refresh();
  return { ok: true };
}

export async function duplicateConcept(id: string): Promise<{ id: string } | Err> {
  const userId = await who();
  if (!userId) return { error: "Unauthorized" };
  const src = await prisma.concept.findFirst({ where: { id, userId } });
  if (!src) return { error: "Concept not found." };
  for (let n = 1; n < 50; n++) {
    const name = `${src.name.slice(0, MAX_NAME - 10)} (copy${n > 1 ? ` ${n}` : ""})`;
    if (await prisma.concept.findFirst({ where: { userId, nameNormalized: name.toLowerCase() }, select: { id: true } })) continue;
    const copy = await prisma.concept.create({ data: { userId, name, nameNormalized: name.toLowerCase(), description: src.description, classification: src.classification, definition: src.definition as Prisma.InputJsonValue } });
    refresh();
    return { id: copy.id };
  }
  return { error: "Couldn't find a free name for the copy." };
}
