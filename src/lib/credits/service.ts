import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_ACTIONS, PLANS, refusalFor, splitSpend, totalOf, type CreditAction, type CreditPlan, type Refusal, type Usage } from "./config";
import type { CreditEventRow, CreditSnapshot } from "./types";

// The metered features' accounts: balances, the monthly renewal, daily use, and every change written to a ledger.
// Spending is a compare-and-set on the balances so two things happening at once can never spend the same credit twice.

const MONTH_MS = 30 * 86_400_000;

/** Midnight IST today, as an instant. */
function istMidnight(now = Date.now()): Date {
  const ist = new Date(now + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

type Account = Awaited<ReturnType<typeof prisma.creditAccount.findUniqueOrThrow>>;

/** The user's account, made on first use (free plan) and renewed when its period has ended. */
export async function getAccount(userId: string, now = new Date()): Promise<Account> {
  let acct = await prisma.creditAccount.findUnique({ where: { userId } });
  if (!acct) {
    const spec = PLANS.FREE;
    acct = await prisma.creditAccount
      .create({ data: { userId, plan: "FREE", monthlyBalance: spec.monthlyCredits, periodStart: now, periodEnd: new Date(now.getTime() + MONTH_MS) } })
      .catch(() => prisma.creditAccount.findUniqueOrThrow({ where: { userId } })); // created at the same moment elsewhere
  }
  if (acct.periodEnd <= now) {
    // Renew: the monthly allowance is topped back up to the plan's amount (unused monthly credits don't carry over); top-ups stay.
    let end = acct.periodEnd;
    while (end <= now) end = new Date(end.getTime() + MONTH_MS);
    const monthly = PLANS[acct.plan].monthlyCredits;
    const renewed = await prisma.creditAccount.updateMany({ where: { userId, periodEnd: acct.periodEnd }, data: { monthlyBalance: monthly, periodStart: new Date(end.getTime() - MONTH_MS), periodEnd: end } });
    if (renewed.count) await prisma.creditEvent.create({ data: { userId, kind: "RESET", credits: monthly - acct.monthlyBalance, monthlyAfter: monthly, topupAfter: acct.topupBalance, meta: { plan: acct.plan } } });
    acct = await prisma.creditAccount.findUniqueOrThrow({ where: { userId } });
  }
  return acct;
}

async function usageOf(userId: string, aiRepliesEver: number): Promise<Usage> {
  const since = istMidnight();
  const rows = await prisma.creditEvent.groupBy({ by: ["action"], where: { userId, kind: "SPEND", createdAt: { gte: since }, action: { in: AI_ACTIONS } }, _count: { _all: true } });
  const n = (a: CreditAction) => rows.find((r) => r.action === a)?._count._all ?? 0;
  return { aiToday: AI_ACTIONS.reduce((s, a) => s + n(a), 0), buildsToday: n("ai_build"), voiceToday: n("ai_voice") + n("ai_speak"), aiRepliesEver };
}

export async function snapshot(userId: string): Promise<CreditSnapshot> {
  const acct = await getAccount(userId);
  const spec = PLANS[acct.plan];
  const u = await usageOf(userId, acct.aiRepliesUsed);
  return {
    plan: acct.plan,
    planLabel: spec.label,
    monthly: acct.monthlyBalance,
    monthlyOf: spec.monthlyCredits,
    topup: acct.topupBalance,
    total: acct.monthlyBalance + acct.topupBalance,
    periodEnd: acct.periodEnd.toISOString(),
    aiRepliesLeft: spec.aiLifetimeReplies === null ? null : Math.max(0, spec.aiLifetimeReplies - acct.aiRepliesUsed),
    today: { ai: { used: u.aiToday, cap: spec.daily.ai }, builds: { used: u.buildsToday, cap: spec.daily.build }, voice: { used: u.voiceToday, cap: spec.daily.voice } },
    at: new Date().toISOString(),
  };
}

/** Whether this can be done now. Null = go ahead; otherwise the plain-English reason. Nothing is spent. */
export async function precheck(userId: string, action: CreditAction, cost: number): Promise<Refusal | null> {
  const acct = await getAccount(userId);
  const usage = await usageOf(userId, acct.aiRepliesUsed);
  return refusalFor(acct.plan, { monthly: acct.monthlyBalance, topup: acct.topupBalance }, usage, action, cost);
}

/**
 * Takes the credits for something that has just worked and writes the ledger line. On the free plan an AI reply is counted
 * against the lifetime allowance instead of credits. Returns the fresh snapshot for the live meter.
 */
export async function charge(userId: string, action: CreditAction, cost: number, meta?: Prisma.InputJsonValue): Promise<CreditSnapshot> {
  const isAi = AI_ACTIONS.includes(action);
  for (let attempt = 0; attempt < 4; attempt++) {
    const acct = await getAccount(userId);
    const spec = PLANS[acct.plan];
    const freeAi = isAi && spec.aiLifetimeReplies !== null;
    const next = freeAi ? { monthly: acct.monthlyBalance, topup: acct.topupBalance } : splitSpend({ monthly: acct.monthlyBalance, topup: acct.topupBalance }, cost) ?? { monthly: 0, topup: 0 };
    const ok = await prisma.$transaction(async (tx) => {
      const updated = await tx.creditAccount.updateMany({
        where: { userId, monthlyBalance: acct.monthlyBalance, topupBalance: acct.topupBalance, aiRepliesUsed: acct.aiRepliesUsed },
        data: { monthlyBalance: next.monthly, topupBalance: next.topup, ...(freeAi ? { aiRepliesUsed: acct.aiRepliesUsed + 1 } : {}) },
      });
      if (!updated.count) return false;
      await tx.creditEvent.create({ data: { userId, kind: "SPEND", action, credits: freeAi ? 0 : -(totalOf({ monthly: acct.monthlyBalance, topup: acct.topupBalance }) - totalOf(next)), monthlyAfter: next.monthly, topupAfter: next.topup, ...(meta ? { meta } : {}) } });
      return true;
    });
    if (ok) return snapshot(userId);
  }
  return snapshot(userId); // lost the race four times: the work is done; the meter just re-reads
}

/** Adds credits (a support grant or a top-up). Top-up credits are kept; a grant goes to the top-up bucket too so it isn't wiped by a renewal. */
export async function grant(userId: string, credits: number, kind: "GRANT" | "TOPUP", meta?: Prisma.InputJsonValue): Promise<CreditSnapshot> {
  const acct = await getAccount(userId);
  const updated = await prisma.creditAccount.update({ where: { userId }, data: { topupBalance: acct.topupBalance + credits } });
  await prisma.creditEvent.create({ data: { userId, kind, credits, monthlyAfter: updated.monthlyBalance, topupAfter: updated.topupBalance, ...(meta ? { meta } : {}) } });
  return snapshot(userId);
}

/** Moves an account to another plan: a fresh monthly allowance and a new period starting now (top-ups stay). */
export async function setPlan(userId: string, plan: CreditPlan, meta?: Prisma.InputJsonValue): Promise<CreditSnapshot> {
  const acct = await getAccount(userId);
  const now = new Date();
  const monthly = PLANS[plan].monthlyCredits;
  await prisma.creditAccount.update({ where: { userId }, data: { plan, monthlyBalance: monthly, periodStart: now, periodEnd: new Date(now.getTime() + MONTH_MS) } });
  await prisma.creditEvent.create({ data: { userId, kind: "PLAN", credits: monthly - acct.monthlyBalance, monthlyAfter: monthly, topupAfter: acct.topupBalance, meta: { from: acct.plan, to: plan, ...(typeof meta === "object" && meta && !Array.isArray(meta) ? meta : {}) } } });
  return snapshot(userId);
}

/** True when a ledger line already exists for this message (a voice exchange or a read-aloud already paid for it). */
export async function alreadyPaidFor(userId: string, messageId: string): Promise<boolean> {
  const row = await prisma.creditEvent.findFirst({ where: { userId, kind: "SPEND", meta: { path: ["messageId"], equals: messageId } }, select: { id: true } });
  return !!row;
}

export async function recentEvents(userId: string, take = 60): Promise<CreditEventRow[]> {
  const rows = await prisma.creditEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({ id: r.id, kind: r.kind, action: r.action, credits: r.credits, monthlyAfter: r.monthlyAfter, topupAfter: r.topupAfter, createdAt: r.createdAt.toISOString() }));
}
