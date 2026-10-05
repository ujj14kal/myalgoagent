"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { type Candle } from "@/lib/market-data";
import { computeCustomSeries, validateCustomDef, type CustomIndicatorDef } from "@/lib/custom-indicator";
import { userMarketData } from "@/lib/market-data/for-user";

// The user's own indicators: save, delete, and preview a formula on a real chart.

export type CIResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

export async function saveCustomIndicator(input: { id?: string; name: string; description?: string; def: CustomIndicatorDef }): Promise<CIResult<{ id: string }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  const name = input.name?.trim();
  if (!name || name.length > 60) return { ok: false, error: "Give it a name (up to 60 characters)." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(input.def);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  const description = input.description?.trim().slice(0, 300) || null;
  const clash = await prisma.customIndicator.findFirst({ where: { userId, name, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { id: true } });
  if (clash) return { ok: false, error: `You already have a custom indicator called “${name}”.` };
  if (input.id) {
    const found = await prisma.customIndicator.findFirst({ where: { id: input.id, userId }, select: { id: true } });
    if (!found) return { ok: false, error: "Not found." };
    await prisma.customIndicator.update({ where: { id: found.id }, data: { name, description, def: def as unknown as Prisma.InputJsonValue } });
    revalidatePath("/app/indicators");
    return { ok: true, data: { id: found.id } };
  }
  if ((await prisma.customIndicator.count({ where: { userId } })) >= 100) return { ok: false, error: "You can keep up to 100 custom indicators." };
  const created = await prisma.customIndicator.create({ data: { userId, name, description, def: def as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/indicators");
  return { ok: true, data: { id: created.id } };
}

export async function deleteCustomIndicator(id: string): Promise<CIResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  await prisma.customIndicator.deleteMany({ where: { id, userId } });
  revalidatePath("/app/indicators");
  return { ok: true };
}

export type PreviewData = { candles: Candle[]; values: { time: number; value: number }[]; last: number | null };

/** A formula's values on ~6 months of daily candles for a symbol — for the editor's live preview. */
export async function previewCustomIndicator(def: CustomIndicatorDef, symbol: string): Promise<CIResult<PreviewData>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`ci-preview:${userId}`, 60, 60_000)) return { ok: false, error: "Previewing too often — wait a moment." };
  let clean: CustomIndicatorDef;
  try {
    clean = validateCustomDef(def);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That definition can't be used." };
  }
  const instrument = await prisma.instrument.findUnique({ where: { symbol }, select: { symbol: true } });
  if (!instrument) return { ok: false, error: "Pick an instrument." };
  try {
    const candles = await userMarketData(userId, "view").getHistoricalCandles(symbol, "6mo", "1d");
    const raw = computeCustomSeries(candles, clean);
    const values = candles.flatMap((c, i) => (Number.isFinite(raw[i]) ? [{ time: c.time, value: Math.round(raw[i] * 10000) / 10000 }] : []));
    return { ok: true, data: { candles, values, last: values.at(-1)?.value ?? null } };
  } catch (err) {
    logError("custom-indicator.preview", err, { symbol });
    return { ok: false, error: "Couldn't load prices for the preview — try again." };
  }
}
