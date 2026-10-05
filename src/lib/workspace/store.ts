import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { createStrategyRow } from "@/lib/strategy-write";
import { strategyInputFor } from "./input";
import { compileWorkspace, describeLogic, type WorkspaceCompiled } from "./compile";
import { parseDefinition } from "./definition";
import type { MemberStrategy, WorkspaceDefinition, WorkspaceIssue } from "./types";
import type { ConditionNode } from "@/lib/strategy/types";

/** The user's own strategies that a workspace plan refers to, with their saved rules. */
export async function loadMembers(userId: string, strategyIds: string[]): Promise<MemberStrategy[]> {
  if (strategyIds.length === 0) return [];
  const rows = await prisma.strategy.findMany({
    where: { userId, id: { in: strategyIds }, status: { not: "DELETED" } },
    include: { instrument: { select: { symbol: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    mode: s.mode,
    direction: s.direction,
    instrumentSymbol: s.instrument.symbol,
    timeframe: s.timeframe,
    entryCondition: s.entryCondition as unknown as ConditionNode,
    exitCondition: s.exitCondition as unknown as ConditionNode,
  }));
}

export type Checked = WorkspaceCompiled & { members: MemberStrategy[]; instrumentSymbol: string | null; entryText: string; exitText: string };

/** Everything a plan needs to pass before it can be published — and a plain-English reading of its logic. */
export async function checkDefinition(userId: string, def: WorkspaceDefinition): Promise<Checked> {
  const members = await loadMembers(userId, def.members.map((m) => m.strategyId));
  const compiled = compileWorkspace(def, members);
  const instrument = def.instrumentId ? await prisma.instrument.findUnique({ where: { id: def.instrumentId }, select: { symbol: true } }) : null;
  if (def.instrumentId && !instrument) compiled.errors.push({ where: "Setup", message: "That instrument no longer exists. Choose another." });
  const names = def.members.map((m) => ({ id: m.id, name: members.find((s) => s.id === m.strategyId)?.name ?? m.id }));
  return { ...compiled, members, instrumentSymbol: instrument?.symbol ?? null, entryText: describeLogic(def.entry, names), exitText: describeLogic(def.exit, names) };
}

export type PublishResult = { ok: true; version: number; strategyId: string } | { ok: false; errors: WorkspaceIssue[] };

/**
 * Freezes the draft as the next version and compiles it into an ordinary strategy. The version keeps an exact copy of
 * the plan, so later edits to the draft never change a version that is being tested or traded.
 */
export async function publishVersion(userId: string, workspaceId: string, note?: string): Promise<PublishResult> {
  await enforceRateLimit(`workspace-write:${userId}`, 30, 60_000);
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } });
  if (!ws) return { ok: false, errors: [{ message: "Workspace not found." }] };
  if (ws.status === "ARCHIVED") return { ok: false, errors: [{ message: "This workspace is archived. Reactivate it to publish a new version." }] };
  const def = parseDefinition(ws.draft);
  if (!def) return { ok: false, errors: [{ message: "The plan couldn't be read. Open the workspace and save it again." }] };

  const checked = await checkDefinition(userId, def);
  if (checked.errors.length > 0 || !checked.entryCondition) return { ok: false, errors: checked.errors.length ? checked.errors : [{ message: "There is no entry logic yet." }] };

  const version = ws.latestVersion + 1;
  let versionId: string;
  try {
    const created = await prisma.workspaceVersion.create({ data: { workspaceId: ws.id, version, definition: def as unknown as Prisma.InputJsonValue, note: note?.trim().slice(0, 200) || null } });
    versionId = created.id;
  } catch (err) {
    if (isUniqueConstraintViolation(err, "version")) return { ok: false, errors: [{ message: "Another version was published at the same moment. Try again." }] };
    throw err;
  }

  const strategyName = `${ws.name.slice(0, 100)} · v${version}`;
  const made = await createStrategyRow(strategyInputFor(def, checked.entryCondition, checked.exitCondition, strategyName), userId, { workspaceVersionId: versionId });
  if ("error" in made) {
    await prisma.workspaceVersion.delete({ where: { id: versionId } }).catch(() => {});
    return { ok: false, errors: [{ message: made.error === "DUPLICATE_NAME" ? `You already have a strategy called "${strategyName}". Rename it or this workspace, then publish again.` : made.error }] };
  }
  await prisma.workspace.update({ where: { id: ws.id }, data: { latestVersion: version, status: "ACTIVE" } });
  return { ok: true, version, strategyId: made.id };
}
