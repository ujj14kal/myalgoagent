import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_ACTIONS, PLANS, TRIAL_DAYS, TRIAL_SPEC, effectivePlan, refusalFor, slotRefusal, specOf, splitSpend, totalOf, type CreditAction, type CreditPlan, type PlanKey, type Refusal, type Usage } from "./config";
import type { CreditEventRow, CreditSnapshot } from "./types";
import { creditWarning } from "@/lib/event-email-config";
import { emailEvent } from "@/lib/event-email";

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
    // Every new account starts with the 7-day trial; when it ends the first renewal below drops it to the Free allowance.
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
    acct = await prisma.creditAccount
      .create({ data: { userId, plan: "FREE", monthlyBalance: TRIAL_SPEC.monthlyCredits, periodStart: now, periodEnd: trialEnd, trialEndsAt: trialEnd } })
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
  const key = effectivePlan(acct.plan, acct.trialEndsAt);
  const spec = specOf(key);
  const u = await usageOf(userId, acct.aiRepliesUsed);
  return {
    plan: acct.plan,
    planLabel: spec.label,
    trial: key === "TRIAL" && acct.trialEndsAt ? { endsAt: acct.trialEndsAt.toISOString() } : null,
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
  return refusalFor(effectivePlan(acct.plan, acct.trialEndsAt), { monthly: acct.monthlyBalance, topup: acct.topupBalance }, usage, action, cost);
}

/**
 * Takes the credits for something that has just worked and writes the ledger line. On the free plan an AI reply is counted
 * against the lifetime allowance instead of credits. Returns the fresh snapshot for the live meter.
 */
export async function charge(userId: string, action: CreditAction, cost: number, meta?: Prisma.InputJsonValue): Promise<CreditSnapshot> {
  const isAi = AI_ACTIONS.includes(action);
  for (let attempt = 0; attempt < 4; attempt++) {
    const acct = await getAccount(userId);
    const spec = specOf(effectivePlan(acct.plan, acct.trialEndsAt));
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
  await prisma.creditAccount.update({ where: { userId }, data: { plan, trialEndsAt: null, monthlyBalance: monthly, periodStart: now, periodEnd: new Date(now.getTime() + MONTH_MS) } });
  await prisma.creditEvent.create({ data: { userId, kind: "PLAN", credits: monthly - acct.monthlyBalance, monthlyAfter: monthly, topupAfter: acct.topupBalance, meta: { from: acct.plan, to: plan, ...(typeof meta === "object" && meta && !Array.isArray(meta) ? meta : {}) } } });
  // A paid plan gets its own static IP (off until USER_EGRESS_ENABLED=1); a move to Free starts the grace period. Never blocks the plan change.
  const { syncEgressForPlan } = await import("@/lib/egress/service");
  await syncEgressForPlan(userId, plan !== "FREE").catch(() => undefined);
  void emailEvent(userId, "plan_changed", { subject: `Your plan is now ${PLANS[plan].label}`, headline: `Your plan is now ${PLANS[plan].label}`, body: `${PLANS[plan].label} includes ${PLANS[plan].monthlyCredits.toLocaleString("en-IN")} credits a month${PLANS[plan].slots.live ? `, up to ${PLANS[plan].slots.live} live strategies and ${PLANS[plan].slots.forward} forward tests` : ` and up to ${PLANS[plan].slots.forward} forward tests (going live needs a paid plan)`}.`, path: "/app/account/usage", linkLabel: "See your plan" });
  return snapshot(userId);
}

/** True when a ledger line already exists for this message (a voice exchange or a read-aloud already paid for it). */
export async function alreadyPaidFor(userId: string, messageId: string): Promise<boolean> {
  const row = await prisma.creditEvent.findFirst({ where: { userId, kind: "SPEND", meta: { path: ["messageId"], equals: messageId } }, select: { id: true } });
  return !!row;
}

export async function recentEvents(userId: string, take = 60): Promise<CreditEventRow[]> {
  const rows = await prisma.creditEvent.findMany({ where: { userId, kind: { notIn: ["VOID", "REFUND"] } }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({ id: r.id, kind: r.kind, action: r.action, credits: r.credits, monthlyAfter: r.monthlyAfter, topupAfter: r.topupAfter, createdAt: r.createdAt.toISOString() }));
}

/** Whether the user may start one more live strategy or forward test. Null = yes; otherwise the plain-English reason. */
export async function slotCheck(userId: string, kind: "live" | "forward"): Promise<Refusal | null> {
  const acct = await getAccount(userId);
  const used = kind === "live"
    ? await prisma.liveDeployment.count({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } } })
    : await prisma.paperSession.count({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } } });
  return slotRefusal(effectivePlan(acct.plan, acct.trialEndsAt), kind, used);
}

// ---------- reserve → settle: credits are taken BEFORE the work, atomically, and handed back if the work doesn't happen ----------

export type Reservation = { id: string; userId: string; action: CreditAction; cost: number; taken: { monthly: number; topup: number }; freeAi: boolean; periodEnd: string };
export type Reserved = { ok: true; reservation: Reservation; snapshot: CreditSnapshot } | { ok: false; refusal: Refusal };

/**
 * Checks the plan's rules and takes the price in ONE step (compare-and-set on the balances plus the ledger line). Two calls at
 * the same moment cannot both get through on one credit: the loser re-reads and is checked again. The caller must `refund` if the work fails.
 */
export async function reserve(userId: string, action: CreditAction, cost: number, meta?: Prisma.InputJsonValue): Promise<Reserved> {
  const isAi = AI_ACTIONS.includes(action);
  for (let attempt = 0; attempt < 8; attempt++) {
    const acct = await getAccount(userId);
    const usage = await usageOf(userId, acct.aiRepliesUsed);
    const balance = { monthly: acct.monthlyBalance, topup: acct.topupBalance };
    const refusal = refusalFor(effectivePlan(acct.plan, acct.trialEndsAt), balance, usage, action, cost);
    if (refusal) return { ok: false, refusal };
    const freeAi = isAi && specOf(effectivePlan(acct.plan, acct.trialEndsAt)).aiLifetimeReplies !== null;
    const next = freeAi ? balance : splitSpend(balance, cost);
    if (!next) return { ok: false, refusal: { code: "NO_CREDITS", message: `This needs ${cost} credits.` } };
    const taken = { monthly: balance.monthly - next.monthly, topup: balance.topup - next.topup };
    const made = await prisma.$transaction(async (tx) => {
      const updated = await tx.creditAccount.updateMany({
        where: { userId, monthlyBalance: acct.monthlyBalance, topupBalance: acct.topupBalance, aiRepliesUsed: acct.aiRepliesUsed },
        data: { monthlyBalance: next.monthly, topupBalance: next.topup, ...(freeAi ? { aiRepliesUsed: acct.aiRepliesUsed + 1 } : {}) },
      });
      if (!updated.count) return null;
      return tx.creditEvent.create({ data: { userId, kind: "SPEND", action, credits: -(taken.monthly + taken.topup), monthlyAfter: next.monthly, topupAfter: next.topup, meta: { ...(meta as object | undefined), taken, freeAi, periodEnd: acct.periodEnd.toISOString() } } });
    });
    if (made) {
      // Running low / out: say so once as the balance crosses the line, so nobody is surprised by a refusal later.
      const warn = creditWarning(totalOf(balance), totalOf(next), specOf(effectivePlan(acct.plan, acct.trialEndsAt)).monthlyCredits);
      if (warn) void emailEvent(userId, warn, warn === "credits_out"
        ? { subject: "You're out of credits", headline: "You're out of credits", body: "The AI assistant and backtests that use credits are paused until your credits renew or you top up. Charts, forward tests and your live strategies keep working and never use credits.", path: "/app/account/usage", linkLabel: "See credits and top-ups" }
        : { subject: "Your credits are running low", headline: "Your credits are running low", body: `You have ${totalOf(next)} credits left. They renew on ${acct.periodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}; you can also top up.`, path: "/app/account/usage", linkLabel: "See credits and top-ups" });
      return { ok: true, reservation: { id: made.id, userId, action, cost, taken, freeAi, periodEnd: acct.periodEnd.toISOString() }, snapshot: await snapshot(userId) };
    }
  }
  return { ok: false, refusal: { code: "NO_CREDITS", message: "Couldn't confirm your credits just now. Please try again." } };
}

/** The work didn't happen (it failed, or the safety net replaced the reply): the credits go back and the line stops counting toward daily caps. */
export async function refund(r: Reservation): Promise<CreditSnapshot> {
  await prisma.$transaction(async (tx) => {
    const voided = await tx.creditEvent.updateMany({ where: { id: r.id, kind: "SPEND" }, data: { kind: "VOID" } });
    if (!voided.count) return; // already refunded
    // Monthly credits go back only into the same month they came from (a renewal in between already refilled it); top-up credits always go back.
    const acct = await tx.creditAccount.findUniqueOrThrow({ where: { userId: r.userId } });
    const sameMonth = acct.periodEnd.toISOString() === r.periodEnd;
    const monthly = sameMonth ? r.taken.monthly : 0;
    const updated = await tx.creditAccount.update({
      where: { userId: r.userId },
      data: { monthlyBalance: { increment: monthly }, topupBalance: { increment: r.taken.topup }, ...(r.freeAi ? { aiRepliesUsed: { decrement: 1 } } : {}) },
    });
    if (monthly + r.taken.topup > 0) await tx.creditEvent.create({ data: { userId: r.userId, kind: "REFUND", action: r.action, credits: monthly + r.taken.topup, monthlyAfter: updated.monthlyBalance, topupAfter: updated.topupBalance, meta: { reservation: r.id } } });
  });
  return snapshot(r.userId);
}

/**
 * The work turned out to be bigger than first thought (an AI turn that prepares something): take the difference, atomically.
 * Returns the new reservation, or why it can't be afforded (the first reservation stays as it was).
 */
export async function upgrade(r: Reservation, action: CreditAction, cost: number): Promise<{ ok: true; reservation: Reservation } | { ok: false; refusal: Refusal }> {
  const extra = cost - r.cost;
  if (extra <= 0) return { ok: true, reservation: r };
  for (let attempt = 0; attempt < 8; attempt++) {
    const acct = await getAccount(r.userId);
    const usage = await usageOf(r.userId, acct.aiRepliesUsed);
    const balance = { monthly: acct.monthlyBalance, topup: acct.topupBalance };
    // Judge the new kind of work as if this reservation were not yet counted (it is already one AI reply today).
    const refusal = refusalFor(effectivePlan(acct.plan, acct.trialEndsAt), balance, { ...usage, aiToday: Math.max(0, usage.aiToday - 1), buildsToday: usage.buildsToday, aiRepliesEver: Math.max(0, usage.aiRepliesEver - (r.freeAi ? 1 : 0)) }, action, r.freeAi ? 0 : extra);
    if (refusal) return { ok: false, refusal };
    const next = r.freeAi ? balance : splitSpend(balance, extra);
    if (!next) return { ok: false, refusal: { code: "NO_CREDITS", message: `This needs ${extra} more credits.` } };
    const more = { monthly: balance.monthly - next.monthly, topup: balance.topup - next.topup };
    const done = await prisma.$transaction(async (tx) => {
      const updated = await tx.creditAccount.updateMany({ where: { userId: r.userId, monthlyBalance: acct.monthlyBalance, topupBalance: acct.topupBalance }, data: { monthlyBalance: next.monthly, topupBalance: next.topup } });
      if (!updated.count) return false;
      const taken = { monthly: r.taken.monthly + more.monthly, topup: r.taken.topup + more.topup };
      const res = await tx.creditEvent.updateMany({ where: { id: r.id, kind: "SPEND" }, data: { action, credits: -(taken.monthly + taken.topup), monthlyAfter: next.monthly, topupAfter: next.topup } });
      return res.count ? taken : false;
    });
    if (done) return { ok: true, reservation: { ...r, action, cost, taken: done } };
  }
  return { ok: false, refusal: { code: "NO_CREDITS", message: "Couldn't confirm your credits just now." } };
}

/** The work cost less than was held (e.g. a backtest range the data source clamped): the difference goes back and the line shows the real price. */
export async function settleDown(r: Reservation, action: CreditAction, cost: number): Promise<Reservation> {
  const back = r.cost - cost;
  if (back <= 0 || r.freeAi) return r;
  const backTopup = Math.min(r.taken.topup, back);
  const backMonthly = back - backTopup;
  const kept = await prisma.$transaction(async (tx) => {
    const acct = await tx.creditAccount.findUniqueOrThrow({ where: { userId: r.userId } });
    const monthly = acct.periodEnd.toISOString() === r.periodEnd ? Math.min(backMonthly, r.taken.monthly) : 0;
    const updated = await tx.creditAccount.update({ where: { userId: r.userId }, data: { monthlyBalance: { increment: monthly }, topupBalance: { increment: backTopup } } });
    const taken = { monthly: r.taken.monthly - monthly, topup: r.taken.topup - backTopup };
    await tx.creditEvent.updateMany({ where: { id: r.id, kind: "SPEND" }, data: { action, credits: -(taken.monthly + taken.topup), monthlyAfter: updated.monthlyBalance, topupAfter: updated.topupBalance } });
    return taken;
  });
  return { ...r, action, cost, taken: kept };
}

/** Adds facts to the reservation's ledger line (e.g. the message it paid for, known only after the reply is saved). */
export async function annotate(r: Reservation, extra: Record<string, string | number | null>): Promise<void> {
  const row = await prisma.creditEvent.findUnique({ where: { id: r.id }, select: { meta: true } });
  const meta = typeof row?.meta === "object" && row.meta && !Array.isArray(row.meta) ? row.meta : {};
  await prisma.creditEvent.update({ where: { id: r.id }, data: { meta: { ...meta, ...extra } } });
}
