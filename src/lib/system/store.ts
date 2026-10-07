import "server-only";
import { Prisma } from "@prisma/client";
import type { CandleInterval } from "@/lib/market-data";
import { isIntraday } from "@/lib/market-data/timeframes";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { createStrategyRow, type StrategyInput } from "@/lib/strategy-write";
import { compileSystem, describeConcept, type CompiledSystem } from "./compile";
import { conceptBlockIds, parseBlockDefinition, parseConceptClass, parseConceptDefinition, parseSystemDefinition } from "./definition";
import { NEVER_EXIT_CONDITION } from "@/lib/strategy/types";
import type { BlockDefinition, ConceptSnapshot, SystemIssue, TradingSystemDefinition } from "./types";

/** The user's concepts with their blocks resolved — exactly what a published version freezes. */
export async function loadConceptSnapshots(userId: string, conceptIds: string[]): Promise<ConceptSnapshot[]> {
  if (conceptIds.length === 0) return [];
  const rows = await prisma.concept.findMany({ where: { userId, id: { in: conceptIds } } });
  const defs = rows.map((r) => ({ row: r, def: parseConceptDefinition(r.definition) ?? { schema: 1 as const, logic: null } }));
  const blockIds = [...new Set(defs.flatMap((d) => conceptBlockIds(d.def.logic)))];
  const blocks = blockIds.length ? await prisma.block.findMany({ where: { userId, id: { in: blockIds } } }) : [];
  const byId: Record<string, { name: string; definition: BlockDefinition }> = {};
  for (const b of blocks) {
    const def = parseBlockDefinition(b.definition);
    if (def) byId[b.id] = { name: b.name, definition: def };
  }
  return defs.map(({ row, def }) => ({
    id: row.id,
    name: row.name,
    classification: parseConceptClass(row.classification),
    definition: def,
    blocks: Object.fromEntries(conceptBlockIds(def.logic).filter((id) => byId[id]).map((id) => [id, byId[id]])),
  }));
}

export type CheckedSystem = CompiledSystem & { instrumentSymbol: string | null; concepts: { id: string; name: string; classification: string; text: string }[] };

/** Everything a trading system must pass before it can be published, and its concepts in words. */
export async function checkSystem(userId: string, def: TradingSystemDefinition): Promise<CheckedSystem> {
  const snapshots = await loadConceptSnapshots(userId, def.concepts.map((c) => c.conceptId));
  const compiled = compileSystem(def, snapshots);
  const instrument = def.instrumentId ? await prisma.instrument.findUnique({ where: { id: def.instrumentId }, select: { symbol: true } }) : null;
  if (def.instrumentId && !instrument) compiled.errors.push({ where: "Instruments", message: "That instrument no longer exists. Choose another." });
  if (instrument && !instrument.symbol.endsWith(".NS") && !instrument.symbol.startsWith("^")) compiled.warnings.push({ where: "Instruments", message: `${instrument.symbol} isn't an NSE symbol; it can be tested but not traded live.` });
  if (compiled.errors.length) compiled.runtime = null;
  return {
    ...compiled,
    instrumentSymbol: instrument?.symbol ?? null,
    concepts: snapshots.map((s) => ({ id: s.id, name: s.name, classification: s.classification, text: describeConcept(s.definition, s.blocks) })),
  };
}

/** A published version as the strategy row the engines run: the system's runtime plus its risk and execution settings. */
export function strategyInputForSystem(def: TradingSystemDefinition, compiled: CompiledSystem, name: string): StrategyInput {
  const entry = compiled.longEntry ?? compiled.shortEntry!;
  return {
    name,
    instrumentId: def.instrumentId,
    mode: "NO_CODE",
    // A system's side is chosen per position by its concepts; this is only the side its stored entry rule opens.
    direction: compiled.longEntry ? "LONG" : "SHORT",
    entryCondition: entry,
    exitCondition: NEVER_EXIT_CONDITION,
    positionSizingMode: def.positionSizingMode,
    positionSizingValue: def.positionSizingValue,
    stopLoss: def.stopLoss,
    target: def.target,
    trailingSl: def.trailingSl,
    ...(def.targets.length ? { targets: def.targets } : {}),
    ...(def.entryPlan ? { entryPlan: def.entryPlan } : {}),
    maxPyramidEntries: def.maxPyramidEntries,
    timeframe: def.timeframes.primary,
    noEntryAfterMinute: def.sessions.noEntryAfterMinute,
    squareOffMinute: def.productType === "INTRADAY" ? def.sessions.squareOffMinute : null,
    productType: def.productType ?? (isIntraday(def.timeframes.primary as CandleInterval) ? "INTRADAY" : "DELIVERY"),
    orderType: def.orderType,
    limitMode: def.orderType === "LIMIT" ? (def.limitMode ?? "PERCENT") : null,
    limitValue: def.orderType === "LIMIT" ? def.limitValue : null,
    riskOptions: { ...def.riskOptions, maxCapitalUsePercent: def.capital.maxUtilizationPercent < 100 ? def.capital.maxUtilizationPercent : null },
  };
}

export type PublishResult = { ok: true; version: number; strategyId: string } | { ok: false; errors: SystemIssue[] };

/**
 * Freezes the draft as the next version — the system and an exact copy of every concept and block it uses — and
 * compiles it into a strategy. Later edits to a block, concept or the draft never change a published version.
 */
export async function publishSystem(userId: string, workspaceId: string, note?: string): Promise<PublishResult> {
  await enforceRateLimit(`workspace-write:${userId}`, 30, 60_000);
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } });
  if (!ws) return { ok: false, errors: [{ where: "", message: "Trading system not found." }] };
  if (ws.status === "ARCHIVED") return { ok: false, errors: [{ where: "", message: "This trading system is archived. Reactivate it to publish a new version." }] };
  const def = parseSystemDefinition(ws.draft);
  if (!def) return { ok: false, errors: [{ where: "", message: "The system couldn't be read. Open it and save it again." }] };

  const snapshots = await loadConceptSnapshots(userId, def.concepts.filter((c) => c.enabled).map((c) => c.conceptId));
  const checked = await checkSystem(userId, def);
  if (checked.errors.length > 0 || !checked.runtime) return { ok: false, errors: checked.errors.length ? checked.errors : [{ where: "", message: "The system isn't complete yet." }] };

  const version = ws.latestVersion + 1;
  let versionId: string;
  try {
    const frozen = { ...def, snapshots } as unknown as Prisma.InputJsonValue;
    const created = await prisma.workspaceVersion.create({ data: { workspaceId: ws.id, version, definition: frozen, note: note?.trim().slice(0, 200) || null } });
    versionId = created.id;
  } catch (err) {
    if (isUniqueConstraintViolation(err, "version")) return { ok: false, errors: [{ where: "", message: "Another version was published at the same moment. Try again." }] };
    throw err;
  }

  const strategyName = `${ws.name.slice(0, 100)} · v${version}`;
  const made = await createStrategyRow(strategyInputForSystem(def, checked, strategyName), userId, {
    workspaceVersionId: versionId,
    systemRuntime: checked.runtime as unknown as Prisma.InputJsonValue,
  });
  if ("error" in made) {
    await prisma.workspaceVersion.delete({ where: { id: versionId } }).catch(() => {});
    return { ok: false, errors: [{ where: "", message: made.error === "DUPLICATE_NAME" ? `You already have a strategy called "${strategyName}". Rename it or this system, then publish again.` : made.error }] };
  }
  await prisma.workspace.update({ where: { id: ws.id }, data: { latestVersion: version, status: "ACTIVE" } });
  return { ok: true, version, strategyId: made.id };
}
