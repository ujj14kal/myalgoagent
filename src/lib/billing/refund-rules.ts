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
