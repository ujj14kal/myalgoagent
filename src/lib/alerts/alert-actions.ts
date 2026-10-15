"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { checkNewAlert, MAX_ACTIVE_ALERTS, type AlertDirection } from "./price-alerts";
import { latestPrice } from "./run-alerts";

export type AlertResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function uid() {
  return (await auth())?.user?.id ?? null;
}

export async function createPriceAlert(input: { symbol: string; direction: AlertDirection; price: number; note?: string }): Promise<AlertResult<{ id: string; current: number | null }>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`price-alert:${userId}`, 30, 10 * 60_000)) return { ok: false, error: "Too many alerts created just now — wait a few minutes." };
  if (input.direction !== "ABOVE" && input.direction !== "BELOW") return { ok: false, error: "Choose above or below." };
  const symbol = input.symbol?.trim().toUpperCase();
  const instrument = symbol ? await prisma.instrument.findFirst({ where: { OR: [{ symbol }, { symbol: `${symbol}.NS` }] }, select: { symbol: true } }) : null;
  if (!instrument) return { ok: false, error: "Pick an instrument from the list (for example RELIANCE or BTC-INR)." };
  if ((await prisma.priceAlert.count({ where: { userId, status: "ACTIVE" } })) >= MAX_ACTIVE_ALERTS) return { ok: false, error: `You can have ${MAX_ACTIVE_ALERTS} active alerts. Cancel one first.` };
  const price = Math.round(Number(input.price) * 100) / 100;
  const current = await latestPrice(userId, instrument.symbol);
  const problem = checkNewAlert(input.direction, price, current);
  if (problem) return { ok: false, error: problem };
  try {
    const row = await prisma.priceAlert.create({ data: { userId, symbol: instrument.symbol, direction: input.direction, price, note: input.note?.trim().slice(0, 120) || null } });
    revalidatePath("/app/alerts");
    return { ok: true, data: { id: row.id, current } };
  } catch (err) {
    logError("price-alert.create", err);
    return { ok: false, error: "Couldn't save the alert — try again." };
  }
}

export async function cancelPriceAlert(id: string): Promise<AlertResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  await prisma.priceAlert.updateMany({ where: { id, userId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
  revalidatePath("/app/alerts");
  return { ok: true };
}

/** Removes a finished (fired or cancelled) alert from the list. */
export async function deletePriceAlert(id: string): Promise<AlertResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "Sign in again." };
  await prisma.priceAlert.deleteMany({ where: { id, userId, status: { not: "ACTIVE" } } });
  revalidatePath("/app/alerts");
  return { ok: true };
}
