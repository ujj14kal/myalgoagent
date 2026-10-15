"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { type Candle } from "@/lib/market-data";
import { computeCustomSeries, customParts, customVisual, defaultPart, indicatorRefs, indicatorSlug, PART_LABEL, validateCustomDef, type CustomIndicatorDef, type CustomVisual } from "@/lib/custom-indicator";
import { checkIntegrity, estimateCost, type CostReport, type IntegrityReport } from "@/lib/custom-indicator/integrity";
import { evaluateFormula, parseProgram } from "@/lib/custom-indicator/formula";
import { userMarketData } from "@/lib/market-data/for-user";

// The user's own indicators: save, delete, and preview any kind on a real chart.

export type CIResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

/**
 * Links the other indicators a formula reads with ind(name): each is looked up among the user's own and a copy is attached, so the
 * indicator still works the same if the other one is later edited or deleted. Throws a plain-English error when one is missing.
 */
async function attachUses(userId: string, def: CustomIndicatorDef, ownName?: string): Promise<CustomIndicatorDef> {
  const { uses: _stale, ...bare } = def;
  void _stale;
  const refs = indicatorRefs(bare as CustomIndicatorDef);
  if (!refs.length) return bare as CustomIndicatorDef;
  const rows = await prisma.customIndicator.findMany({ where: { userId }, select: { name: true, def: true } });
  const bySlug = new Map(rows.map((r) => [indicatorSlug(r.name), r] as const));
  const uses: Record<string, CustomIndicatorDef> = {};
  for (const ref of refs) {
    if (ownName && indicatorSlug(ownName) === ref) throw new Error("An indicator can't read itself.");
    const row = bySlug.get(ref);
    if (!row) throw new Error(`You have no custom indicator called “${ref}”. Write the name of one you've saved, with spaces as _ (“Trend score” is trend_score).`);
    uses[ref] = row.def as unknown as CustomIndicatorDef;
  }
  return { ...bare, uses } as CustomIndicatorDef;
}

export async function saveCustomIndicator(input: { id?: string; name: string; description?: string; def: CustomIndicatorDef; /** The name is one the user already has: update that indicator (its old version goes to the history) instead of refusing. */ replaceExisting?: boolean }): Promise<CIResult<{ id: string }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  const name = input.name?.trim();
  if (!name || name.length > 60) return { ok: false, error: "Give it a name (up to 60 characters)." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(await attachUses(userId, input.def, name));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  const description = input.description?.trim().slice(0, 300) || null;
  const clash = await prisma.customIndicator.findFirst({ where: { userId, name, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { id: true } });
  if (clash && input.replaceExisting && !input.id) input = { ...input, id: clash.id };
  else if (clash) return { ok: false, error: `You already have a custom indicator called “${name}”.` };
  if (input.id) {
    const found = await prisma.customIndicator.findFirst({ where: { id: input.id, userId }, select: { id: true, name: true, description: true, def: true, history: true } });
    if (!found) return { ok: false, error: "Not found." };
    // The version being replaced is kept (newest first) so the edit can be undone.
    const changed = JSON.stringify(found.def) !== JSON.stringify(def) || found.name !== name;
    const history = changed ? pushVersion(found.history, { name: found.name, description: found.description, def: found.def }) : undefined;
    await prisma.customIndicator.update({ where: { id: found.id }, data: { name, description, def: def as unknown as Prisma.InputJsonValue, ...(history ? { history: history as unknown as Prisma.InputJsonValue } : {}) } });
    revalidatePath("/app/indicators");
    return { ok: true, data: { id: found.id } };
  }
  if ((await prisma.customIndicator.count({ where: { userId } })) >= 100) return { ok: false, error: "You can keep up to 100 custom indicators." };
  const created = await prisma.customIndicator.create({ data: { userId, name, description, def: def as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/indicators");
  return { ok: true, data: { id: created.id } };
}

export type IndicatorVersion = { at: string; name: string; description: string | null; def: CustomIndicatorDef };
const MAX_VERSIONS = 20;
function pushVersion(history: unknown, v: { name: string; description: string | null; def: unknown }): IndicatorVersion[] {
  const old = Array.isArray(history) ? (history as IndicatorVersion[]) : [];
  return [{ at: new Date().toISOString(), name: v.name, description: v.description, def: v.def as CustomIndicatorDef }, ...old].slice(0, MAX_VERSIONS);
}

/** A free name for a copy: "Name copy", "Name copy 2"… */
async function freeName(userId: string, base: string): Promise<string> {
  const taken = new Set((await prisma.customIndicator.findMany({ where: { userId, name: { startsWith: base.slice(0, 40) } }, select: { name: true } })).map((r) => r.name));
  const stem = base.slice(0, 50);
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 100; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
  return `${stem} ${Date.now() % 10000}`;
}

export async function duplicateCustomIndicator(id: string): Promise<CIResult<{ id: string }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  const src = await prisma.customIndicator.findFirst({ where: { id, userId } });
  if (!src) return { ok: false, error: "Not found." };
  if ((await prisma.customIndicator.count({ where: { userId } })) >= 100) return { ok: false, error: "You can keep up to 100 custom indicators." };
  const created = await prisma.customIndicator.create({ data: { userId, name: await freeName(userId, `${src.name} copy`), description: src.description, def: src.def as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/indicators");
  return { ok: true, data: { id: created.id } };
}

/** Brings back an earlier version; the current one becomes the newest entry in the history, so nothing is lost. */
export async function restoreCustomIndicatorVersion(id: string, index: number): Promise<CIResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  const cur = await prisma.customIndicator.findFirst({ where: { id, userId } });
  const list = Array.isArray(cur?.history) ? (cur!.history as unknown as IndicatorVersion[]) : [];
  const v = list[index];
  if (!cur || !v) return { ok: false, error: "That version isn't there any more." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(v.def);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That version can't be used." };
  }
  const clash = v.name !== cur.name && (await prisma.customIndicator.findFirst({ where: { userId, name: v.name, NOT: { id } }, select: { id: true } }));
  const history = pushVersion(list.filter((_, i) => i !== index), { name: cur.name, description: cur.description, def: cur.def });
  await prisma.customIndicator.update({ where: { id }, data: { def: def as unknown as Prisma.InputJsonValue, description: v.description, ...(clash ? {} : { name: v.name }), history: history as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/indicators");
  return { ok: true };
}

/** Adds an indicator from the text another user (or an earlier export) gave: { name, description?, def }. */
export async function importCustomIndicator(text: string): Promise<CIResult<{ id: string }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  let raw: { name?: unknown; description?: unknown; def?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't an exported indicator — paste the whole text you copied." };
  }
  if (typeof raw?.name !== "string" || !raw.name.trim()) return { ok: false, error: "The text has no indicator name." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(raw.def);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  if ((await prisma.customIndicator.count({ where: { userId } })) >= 100) return { ok: false, error: "You can keep up to 100 custom indicators." };
  const created = await prisma.customIndicator.create({
    data: { userId, name: await freeName(userId, raw.name.trim().slice(0, 50)), description: typeof raw.description === "string" ? raw.description.trim().slice(0, 300) || null : null, def: def as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/app/indicators");
  return { ok: true, data: { id: created.id } };
}

export type InspectColumn = { key: string; label: string; kind: "output" | "step"; values: (number | null)[] };
export type InspectData = {
  symbol: string;
  interval: string;
  bars: number;
  computeMs: number;
  integrity: IntegrityReport;
  cost: CostReport;
  /** The last candles, oldest first, with each output and each named step. */
  times: number[];
  closes: number[];
  columns: InspectColumn[];
};

const INSPECT_RANGE = { "1d": "1y", "60m": "3mo", "15m": "1mo", "5m": "5d" } as const;
export type InspectInterval = keyof typeof INSPECT_RANGE;

/** Tests an indicator on real candles: its values, every named step, repainting and cost. */
export async function inspectCustomIndicator(input: { def: CustomIndicatorDef; symbol: string; interval: InspectInterval }): Promise<CIResult<InspectData>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`ci-inspect:${userId}`, 20, 60_000)) return { ok: false, error: "Testing too often — wait a moment." };
  const range = INSPECT_RANGE[input.interval];
  if (!range) return { ok: false, error: "Pick a candle size." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(await attachUses(userId, input.def));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  const instrument = await prisma.instrument.findUnique({ where: { symbol: input.symbol }, select: { symbol: true } });
  if (!instrument) return { ok: false, error: "Pick an instrument." };
  try {
    const candles = await userMarketData(userId, "view").getHistoricalCandles(input.symbol, range, input.interval);
    if (candles.length < 5) return { ok: false, error: "That instrument has too few candles in this window." };
    const started = performance.now();
    const columns: InspectColumn[] = [];
    const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null);
    for (const part of customParts(def)) columns.push({ key: `out-${part}`, label: part === "value" ? "Indicator value" : (PART_LABEL[part] ?? part), kind: "output", values: computeCustomSeries(candles, def, part).map(num) });
    if (def.type === "formula" || def.type === "signal") for (const st of parseProgram(def.formula, Object.keys(def.uses ?? {})).steps) columns.push({ key: `step-${st.name}`, label: st.name, kind: "step", values: evaluateFormula(st.tree, candles, (n, c) => computeCustomSeries(c, def.uses![n])).map(num) });
    const computeMs = Math.round(performance.now() - started);
    const take = 40;
    return {
      ok: true,
      data: {
        symbol: input.symbol,
        interval: input.interval,
        bars: candles.length,
        computeMs,
        integrity: checkIntegrity(candles, def),
        cost: estimateCost(def),
        times: candles.slice(-take).map((c) => c.time),
        closes: candles.slice(-take).map((c) => c.close),
        columns: columns.map((c) => ({ ...c, values: c.values.slice(-take) })),
      },
    };
  } catch (err) {
    logError("custom-indicator.inspect", err, { symbol: input.symbol });
    return { ok: false, error: "Couldn't load prices to test with — try again." };
  }
}

export async function deleteCustomIndicator(id: string): Promise<CIResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  await prisma.customIndicator.deleteMany({ where: { id, userId } });
  revalidatePath("/app/indicators");
  return { ok: true };
}

export type PreviewData = { candles: Candle[]; visual: CustomVisual; last: number | null; lastLabel: string };

/** An indicator drawn on ~6 months of daily candles for a symbol — for the editor's live preview. */
export async function previewCustomIndicator(def: CustomIndicatorDef, symbol: string, name = "Preview"): Promise<CIResult<PreviewData>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`ci-preview:${userId}`, 60, 60_000)) return { ok: false, error: "Previewing too often — wait a moment." };
  let clean: CustomIndicatorDef;
  try {
    clean = validateCustomDef(await attachUses(userId, def));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  const instrument = await prisma.instrument.findUnique({ where: { symbol }, select: { symbol: true } });
  if (!instrument) return { ok: false, error: "Pick an instrument." };
  try {
    const candles = await userMarketData(userId, "view").getHistoricalCandles(symbol, "6mo", "1d");
    const visual = customVisual(candles, clean, name.trim() || "Preview");
    // The latest value a rule would read by default (the middle line for zones/bands, 1/0 for signals).
    const raw = computeCustomSeries(candles, clean);
    const lastRaw = raw.at(-1);
    return { ok: true, data: { candles, visual, last: lastRaw !== undefined && Number.isFinite(lastRaw) ? Math.round(lastRaw * 10000) / 10000 : null, lastLabel: PART_LABEL[defaultPart(clean)] } };
  } catch (err) {
    logError("custom-indicator.preview", err, { symbol });
    return { ok: false, error: "Couldn't load prices for the preview — try again." };
  }
}
