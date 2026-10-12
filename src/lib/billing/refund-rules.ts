// The rules around refunds, kept pure so they are tested. What the policy is (who gets money back) is for the team to
// decide case by case; these only stop impossible or duplicate requests and keep the amounts honest.

/** Razorpay can refund a payment for 180 days; we stop asking customers a little before that. */
export const REFUND_WINDOW_DAYS = 170;
export const MIN_REASON = 8;
export const MAX_REASON = 600;

export type PaymentFacts = { status: string; createdAt: Date; amount: number; refundedAt: Date | null };

/** Why a customer can't ask for a refund on this payment, in plain words; null = they can. */
export function requestProblem(p: PaymentFacts, hasOpenRequest: boolean, now = new Date()): string | null {
  if (p.refundedAt || p.status === "refunded") return "This payment has already been refunded.";
  if (p.status !== "captured") return "Only a completed payment can be refunded.";
  if (hasOpenRequest) return "You already have a refund request on this payment — we'll update you by email.";
  if ((now.getTime() - p.createdAt.getTime()) / 86_400_000 > REFUND_WINDOW_DAYS) return "This payment is too old to refund online. Please contact support.";
  return null;
}

export function cleanReason(raw: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (reason.length < MIN_REASON) return { ok: false, error: "Please tell us briefly why (at least a few words)." };
  return { ok: true, reason: reason.slice(0, MAX_REASON) };
}

/** The amount to refund (paise): between 1 paisa and what was paid. */
export function refundAmountProblem(amountPaise: number, paidPaise: number): string | null {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) return "The refund must be at least ₹1.";
  if (amountPaise > paidPaise) return "The refund can't be more than what was paid.";
  return null;
}

/** Rupees typed by staff (e.g. "999.50") to paise, or NaN when it isn't a clean amount. */
export function rupeesToPaise(input: string): number {
  const t = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

/** How much of a top-up's credits can be taken back: what was granted, but never more than they still hold. */
export const creditsToTakeBack = (granted: number, topupBalance: number) => Math.max(0, Math.min(granted, topupBalance));


// ---------- the refund policy ----------
// No refunds, with one exception: a plan (autopay) payment the customer tells us about within 3 working days, when none or
// less than 5% of that period's credits have been used. ₹100 is kept as a charge; the rest goes back. Credit top-ups are
// not refundable. The team can still make an exception by refunding a payment directly.

export const POLICY = { workingDays: 3, feePaise: 10_000, maxUsedShare: 0.05 } as const;

const IST_MS = 330 * 60_000;
/** The calendar day (in India) a moment falls on, as a UTC midnight, so weekdays can be counted. */
const istDay = (d: Date) => {
  const t = new Date(d.getTime() + IST_MS);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};
const isWeekend = (utcMidnight: number) => [0, 6].includes(new Date(utcMidnight).getUTCDay());

/**
 * The last moment a request is in time: the end (Indian time) of the 3rd working day after the payment's day. The payment's
 * own day is day 0, and Saturdays and Sundays don't count (we don't track public holidays).
 */
export function policyDeadline(paidAt: Date, workingDays = POLICY.workingDays): Date {
  let day = istDay(paidAt);
  let counted = 0;
  while (counted < workingDays) {
    day += 86_400_000;
    if (!isWeekend(day)) counted++;
  }
  return new Date(day + 86_400_000 - 1 - IST_MS);
}

export type PolicyInput = {
  kind: string;
  amountPaise: number;
  paidAt: Date;
  /** When the customer got in touch (or now, for a check). */
  askedAt: Date;
  /** Credits used since the payment, and the credits the plan gives for the period. */
  creditsUsed: number;
  planCredits: number;
};
export type PolicyVerdict = { eligible: boolean; refundPaise: number; feePaise: number; usedShare: number; deadline: Date; reason: string | null };

export function policyVerdict(i: PolicyInput): PolicyVerdict {
  const deadline = policyDeadline(i.paidAt);
  const usedShare = i.planCredits > 0 ? Math.max(0, i.creditsUsed) / i.planCredits : 0;
  const refundPaise = Math.max(0, i.amountPaise - POLICY.feePaise);
  const base = { refundPaise, feePaise: POLICY.feePaise, usedShare, deadline };
  const day = deadline.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  if (i.kind !== "subscription") return { ...base, eligible: false, reason: "One-time payments, such as credit top-ups, are final and can't be refunded." };
  if (i.askedAt.getTime() > deadline.getTime()) return { ...base, eligible: false, reason: `A plan payment can be refunded only if you reach us within ${POLICY.workingDays} working days of paying (that was by ${day}).` };
  if (usedShare >= POLICY.maxUsedShare) return { ...base, eligible: false, reason: `A plan payment can be refunded only if less than 5% of its credits have been used; ${Math.round(usedShare * 100)}% have been used.` };
  if (refundPaise <= 0) return { ...base, eligible: false, reason: "There's nothing left to refund after the ₹100 charge." };
  return { ...base, eligible: true, reason: null };
}
