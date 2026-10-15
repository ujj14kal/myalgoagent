"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { userMarketData } from "@/lib/market-data/for-user";
import { computeCustomSeries, deepSymbols, validateCustomDef, type CustomIndicatorDef } from "@/lib/custom-indicator";
import { checkIntegrity } from "@/lib/custom-indicator/integrity";
import { loadInstrumentCandles } from "@/lib/custom-indicator/load";
import { LIMITATIONS_MAX, MAX_PUBLISHED_PER_USER, publishProblem, shouldHide, validStars } from "@/lib/custom-indicator/community";

// The community library: publish one of your indicators, add others' to your own list, rate and report. Every published indicator shows
// its author, its description, its formula, and the result of the repainting check run when it was published.

export type CommunityResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function who() {
  const id = (await auth())?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, status: true } });
  return u && u.status === "ACTIVE" ? u : null;
}

/** Publishes (or updates) one of your indicators in the library. The repainting check is run now, on a year of daily candles, and shown to everyone. */
export async function publishIndicator(input: { id: string; description: string; limitations?: string }): Promise<CommunityResult> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  if (!me.username) return { ok: false, error: "Choose a username first: your username is shown as the author." };
  if (await checkRateLimit(`ci-publish:${me.id}`, 10, 10 * 60_000)) return { ok: false, error: "Publishing too often — wait a few minutes." };
  const mine = await prisma.customIndicator.findFirst({ where: { id: input.id, userId: me.id } });
  if (!mine) return { ok: false, error: "Not found." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(mine.def);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That indicator can't be used." };
  }
  const problem = publishProblem(def, input.description ?? "");
  if (problem) return { ok: false, error: problem };
  const exists = await prisma.communityIndicator.findUnique({ where: { authorId_name: { authorId: me.id, name: mine.name } }, select: { id: true } });
  if (!exists && (await prisma.communityIndicator.count({ where: { authorId: me.id } })) >= MAX_PUBLISHED_PER_USER) return { ok: false, error: `You can publish up to ${MAX_PUBLISHED_PER_USER} indicators.` };
  try {
    const candles = await userMarketData(me.id, "view").getHistoricalCandles("RELIANCE.NS", "1y", "1d");
    const instruments = await loadInstrumentCandles(me.id, deepSymbols(def), "1d", "1y");
    const report = checkIntegrity(candles, def, 3, (c, d, p) => computeCustomSeries(c, d, p, { instruments }));
    const row = {
      authorName: me.username,
      description: input.description.trim(),
      limitations: input.limitations?.trim().slice(0, LIMITATIONS_MAX) || null,
      def: def as unknown as Prisma.InputJsonValue,
      repaints: !report.stable,
      integrityNote: report.verdict,
      timing: report.timing as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
    };
    await prisma.communityIndicator.upsert({ where: { authorId_name: { authorId: me.id, name: mine.name } }, create: { authorId: me.id, name: mine.name, ...row }, update: row });
  } catch (err) {
    logError("community.publish", err, { id: input.id });
    return { ok: false, error: "Couldn't run the repainting check just now — try again." };
  }
  revalidatePath("/app/indicators/library");
  return { ok: true };
}

export async function unpublishIndicator(communityId: string): Promise<CommunityResult> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  await prisma.communityIndicator.deleteMany({ where: { id: communityId, authorId: me.id } });
  revalidatePath("/app/indicators/library");
  return { ok: true };
}

async function freeName(userId: string, base: string): Promise<string> {
  const taken = new Set((await prisma.customIndicator.findMany({ where: { userId, name: { startsWith: base.slice(0, 40) } }, select: { name: true } })).map((r) => r.name));
  const stem = base.slice(0, 50);
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 100; n++) if (!taken.has(`${stem} ${n}`)) return `${stem} ${n}`;
  return `${stem} ${Date.now() % 10000}`;
}

/** Copies a published indicator into your own list. It is yours from then on: later changes by the author never reach it. */
export async function addFromLibrary(communityId: string): Promise<CommunityResult<{ name: string }>> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  const found = await prisma.communityIndicator.findFirst({ where: { id: communityId, status: "PUBLISHED" } });
  if (!found) return { ok: false, error: "That indicator isn't available any more." };
  if ((await prisma.customIndicator.count({ where: { userId: me.id } })) >= 100) return { ok: false, error: "You can keep up to 100 custom indicators." };
  let def: CustomIndicatorDef;
  try {
    def = validateCustomDef(found.def);
  } catch {
    return { ok: false, error: "That indicator can't be used." };
  }
  const name = await freeName(me.id, found.name);
  await prisma.customIndicator.create({ data: { userId: me.id, name, description: `${found.description}\n(From the library, by ${found.authorName}.)`.slice(0, 300), def: def as unknown as Prisma.InputJsonValue, collection: "From the library" } });
  if (found.authorId !== me.id) await prisma.communityIndicator.update({ where: { id: found.id }, data: { installs: { increment: 1 } } });
  revalidatePath("/app/indicators");
  return { ok: true, data: { name } };
}

export async function rateIndicator(communityId: string, stars: number, review?: string): Promise<CommunityResult> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  if (!validStars(stars)) return { ok: false, error: "Choose 1 to 5 stars." };
  const ind = await prisma.communityIndicator.findFirst({ where: { id: communityId, status: "PUBLISHED" }, select: { id: true, authorId: true } });
  if (!ind) return { ok: false, error: "That indicator isn't available any more." };
  if (ind.authorId === me.id) return { ok: false, error: "You can't rate your own indicator." };
  await prisma.communityRating.upsert({
    where: { indicatorId_userId: { indicatorId: ind.id, userId: me.id } },
    create: { indicatorId: ind.id, userId: me.id, stars, review: review?.trim().slice(0, 300) || null },
    update: { stars, review: review?.trim().slice(0, 300) || null },
  });
  const agg = await prisma.communityRating.aggregate({ where: { indicatorId: ind.id }, _sum: { stars: true }, _count: true });
  await prisma.communityIndicator.update({ where: { id: ind.id }, data: { ratingSum: agg._sum.stars ?? 0, ratingCount: agg._count } });
  revalidatePath("/app/indicators/library");
  return { ok: true };
}

/** Flags an indicator for the team. Several different people reporting it takes it down until it has been looked at. */
export async function reportIndicator(communityId: string, reason: string): Promise<CommunityResult> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  const text = reason?.trim().slice(0, 300);
  if (!text || text.length < 5) return { ok: false, error: "Say briefly what is wrong (a few words)." };
  if (await checkRateLimit(`ci-report:${me.id}`, 10, 60 * 60_000)) return { ok: false, error: "Too many reports — wait a while." };
  const ind = await prisma.communityIndicator.findUnique({ where: { id: communityId }, select: { id: true } });
  if (!ind) return { ok: false, error: "That indicator isn't there any more." };
  await prisma.communityReport.upsert({ where: { indicatorId_userId: { indicatorId: ind.id, userId: me.id } }, create: { indicatorId: ind.id, userId: me.id, reason: text }, update: { reason: text } });
  const count = await prisma.communityReport.count({ where: { indicatorId: ind.id } });
  await prisma.communityIndicator.update({ where: { id: ind.id }, data: { reportCount: count, ...(shouldHide(count) ? { status: "HIDDEN" } : {}) } });
  revalidatePath("/app/indicators/library");
  return { ok: true };
}

/** Files one of your indicators under a collection name (or takes it out). */
export async function setCollection(id: string, collection: string | null): Promise<CommunityResult> {
  const me = await who();
  if (!me) return { ok: false, error: "Sign in again." };
  const name = collection?.trim().slice(0, 30) || null;
  await prisma.customIndicator.updateMany({ where: { id, userId: me.id }, data: { collection: name } });
  revalidatePath("/app/indicators");
  return { ok: true };
}

