"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { type Candle } from "@/lib/market-data";
import { computeCustomSeries, customParts, customVisual, deepSymbols, defaultPart, externalRefs, indicatorSlug, PART_LABEL, validateCustomDef, type CustomIndicatorDef, type CustomVisual } from "@/lib/custom-indicator";
import { checkIntegrity, estimateCost, type CostReport, type IntegrityReport } from "@/lib/custom-indicator/integrity";
import { evaluateFormula, parseProgram, type Externals } from "@/lib/custom-indicator/formula";
import { parseDataset } from "@/lib/custom-indicator/dataset";
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
  const { uses: _stale, data: _staleData, ...bare } = def;
  void _stale;
  void _staleData;
  const { inds, datas } = externalRefs(bare as CustomIndicatorDef);
  let out = bare as CustomIndicatorDef;
  if (inds.length) {
    const rows = await prisma.customIndicator.findMany({ where: { userId }, select: { name: true, def: true } });
    const bySlug = new Map(rows.map((r) => [indicatorSlug(r.name), r] as const));
    const uses: Record<string, CustomIndicatorDef> = {};
    for (const ref of inds) {
      if (ownName && indicatorSlug(ownName) === ref) throw new Error("An indicator can't read itself.");
      const row = bySlug.get(ref);
      if (!row) throw new Error(`You have no custom indicator called “${ref}”. Write the name of one you've saved, with spaces as _ (“Trend score” is trend_score).`);
      uses[ref] = row.def as unknown as CustomIndicatorDef;
    }
    out = { ...out, uses };
  }
  if (datas.length) {
    // A copy of each dataset travels with the indicator, so every backtest and live run reads exactly the same numbers.
    const sets = await prisma.userDataset.findMany({ where: { userId, slug: { in: datas } }, select: { slug: true, times: true, values: true } });
    const data: Record<string, { t: number[]; v: number[] }> = {};
    for (const ref of datas) {
      const row = sets.find((s) => s.slug === ref);
      if (!row) throw new Error(`You have no dataset called “${ref}”. Upload it under Your datasets (spaces in its name written as _).`);
      data[ref] = { t: row.times as unknown as number[], v: row.values as unknown as number[] };
    }
    out = { ...out, data };
  }
  return out;
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
    const ext: Externals = { instruments: await loadInstrumentCandles(userId, deepSymbols(def), input.interval, range) };
    const started = performance.now();
    const columns: InspectColumn[] = [];
    const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null);
    for (const part of customParts(def)) columns.push({ key: `out-${part}`, label: part === "value" ? "Indicator value" : (PART_LABEL[part] ?? part), kind: "output", values: computeCustomSeries(candles, def, part, ext).map(num) });
    if (def.type === "formula" || def.type === "signal") for (const st of parseProgram(def.formula, Object.keys(def.uses ?? {}), Object.keys(def.data ?? {})).steps) columns.push({ key: `step-${st.name}`, label: st.name, kind: "step", values: evaluateFormula(st.tree, candles, (n, c) => computeCustomSeries(c, def.uses![n], undefined, ext), { instruments: ext.instruments, data: def.data }).map(num) });
    const computeMs = Math.round(performance.now() - started);
    const take = 40;
    return {
      ok: true,
      data: {
        symbol: input.symbol,
        interval: input.interval,
        bars: candles.length,
        computeMs,
        integrity: checkIntegrity(candles, def, 5, (c, d, p) => computeCustomSeries(c, d, p, ext)),
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
    const ext: Externals = { instruments: await loadInstrumentCandles(userId, deepSymbols(clean), "1d", "6mo") };
    const visual = customVisual(candles, clean, name.trim() || "Preview", ext);
    // The latest value a rule would read by default (the middle line for zones/bands, 1/0 for signals).
    const raw = computeCustomSeries(candles, clean, undefined, ext);
    const lastRaw = raw.at(-1);
    return { ok: true, data: { candles, visual, last: lastRaw !== undefined && Number.isFinite(lastRaw) ? Math.round(lastRaw * 10000) / 10000 : null, lastLabel: PART_LABEL[defaultPart(clean)] } };
  } catch (err) {
    logError("custom-indicator.preview", err, { symbol });
    return { ok: false, error: "Couldn't load prices for the preview — try again." };
  }
}

// ---------- other instruments (sym) and uploaded datasets (data) ----------

const SYMBOLS_AT_ONCE = 5;

/** Candles of every other instrument an indicator reads with sym(), on the same candle size, for charts and tests. */
async function loadInstrumentCandles(userId: string, symbols: string[], interval: string, range: string): Promise<Externals["instruments"]> {
  if (!symbols.length) return {};
  if (symbols.length > SYMBOLS_AT_ONCE) throw new Error(`An indicator can read at most ${SYMBOLS_AT_ONCE} other instruments at once.`);
  const known = await prisma.instrument.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true } });
  const missing = symbols.filter((s) => !known.some((k) => k.symbol === s));
  if (missing.length) throw new Error(`${missing.join(", ")} isn't an instrument on this platform (write it as it appears on the instrument page, like RELIANCE.NS or ^NSEI).`);
  const market = userMarketData(userId, "view");
  const entries = await Promise.all(
    symbols.map(async (s) => [s, await market.getHistoricalCandles(s, range as Parameters<typeof market.getHistoricalCandles>[1], interval as Parameters<typeof market.getHistoricalCandles>[2])] as const),
  );
  return Object.fromEntries(entries);
}

/** For a chart: the candles of other instruments the active indicators read, matching the chart's range and candle size. */
export async function loadIndicatorInstruments(symbols: string[], interval: string, range: string): Promise<CIResult<Record<string, Candle[]>>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`ci-instruments:${userId}`, 60, 60_000)) return { ok: false, error: "Loading too often — wait a moment." };
  try {
    return { ok: true, data: (await loadInstrumentCandles(userId, [...new Set(symbols)].slice(0, SYMBOLS_AT_ONCE + 1), interval, range)) ?? {} };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't load those instruments." };
  }
}

export type DatasetRow = { id: string; name: string; slug: string; description: string | null; rows: number; from: number; to: number };

export async function createDataset(input: { name: string; description?: string; csv: string }): Promise<CIResult<{ slug: string; skipped: number }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`ci-dataset:${userId}`, 20, 10 * 60_000)) return { ok: false, error: "Uploading too often — wait a few minutes." };
  const name = input.name?.trim();
  const slug = name ? indicatorSlug(name) : "";
  if (!name || name.length > 40 || !/^[a-z_][a-z0-9_]*$/.test(slug)) return { ok: false, error: "Give it a name that starts with a letter (up to 40 characters), e.g. Model score." };
  if (["ind", "sym", "data", "fn", "self", "param"].includes(slug)) return { ok: false, error: "That name is used by the formula language; pick another." };
  let parsed;
  try {
    parsed = parseDataset(input.csv);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That table can't be read." };
  }
  if ((await prisma.userDataset.count({ where: { userId } })) >= 20) return { ok: false, error: "You can keep up to 20 datasets." };
  if (await prisma.userDataset.findUnique({ where: { userId_slug: { userId, slug } }, select: { id: true } })) return { ok: false, error: `You already have a dataset called “${name}”.` };
  await prisma.userDataset.create({ data: { userId, name, slug, description: input.description?.trim().slice(0, 200) || null, times: parsed.times, values: parsed.values, rows: parsed.times.length } });
  revalidatePath("/app/indicators");
  return { ok: true, data: { slug, skipped: parsed.skipped } };
}

export async function deleteDataset(id: string): Promise<CIResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  await prisma.userDataset.deleteMany({ where: { id, userId } });
  revalidatePath("/app/indicators");
  return { ok: true };
}
