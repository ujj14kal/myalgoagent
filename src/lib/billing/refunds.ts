import "server-only";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { sendEventEmail, sendSupportCaseNotice } from "@/lib/email";
import { setPlan } from "@/lib/credits/service";
import { siteUrl } from "@/lib/site";
import { rupees } from "./invoice";
import * as rzp from "./razorpay";
import { BillingError, recordRefund } from "./service";
import { PLANS } from "@/lib/credits/config";
import { cleanReason, creditsToTakeBack, policyVerdict, refundAmountProblem, requestProblem, type PolicyVerdict } from "./refund-rules";

// Refunds, end to end. A customer asks (with a reason); a person on the team decides; if they approve, the money goes back
// through Razorpay, the credit note is sent, and — only if staff choose — the plan is cancelled or top-up credits taken back.

type PolicyPayment = { id: string; userId: string; kind: string; amount: number; createdAt: Date; subscriptionId: string | null };

/**
 * Applies the refund policy to a payment: was it a plan payment, are we inside the 3 working days, and how much of that
 * period's credits had been used by `at` (the moment the customer got in touch, or now).
 */
export async function paymentPolicy(p: PolicyPayment, at: Date = new Date()): Promise<PolicyVerdict> {
  let planCredits = 0;
  let creditsUsed = 0;
  if (p.kind === "subscription") {
    const sub = p.subscriptionId ? await prisma.subscription.findUnique({ where: { id: p.subscriptionId }, select: { plan: true } }) : null;
    planCredits = sub ? PLANS[sub.plan].monthlyCredits : 0;
    // Only what was really spent: reservations that were handed back are VOID and don't count.
    const spent = await prisma.creditEvent.aggregate({ _sum: { credits: true }, where: { userId: p.userId, kind: "SPEND", createdAt: { gte: p.createdAt, lte: at } } });
    creditsUsed = Math.abs(spent._sum.credits ?? 0);
  }
  return policyVerdict({ kind: p.kind, amountPaise: p.amount, paidAt: p.createdAt, askedAt: at, creditsUsed, planCredits });
}

/** The customer's request. Nothing moves yet: the team is told and the customer gets an acknowledgement. */
export async function requestRefund(userId: string, paymentId: string, rawReason: unknown) {
  await enforceRateLimit(`refund-request:${userId}`, 5, 3_600_000);
  const reason = cleanReason(rawReason);
  if (!reason.ok) throw new BillingError(reason.error);
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId }, include: { user: { select: { email: true, name: true } } } });
  if (!p) throw new BillingError("We couldn't find that payment.");
  const open = await prisma.refundRequest.count({ where: { paymentId: p.id, status: "PENDING" } });
  const problem = requestProblem(p, open > 0);
  if (problem) throw new BillingError(problem);
  // The policy decides who can ask: anything else is turned away up front, with the reason, instead of waiting in a queue.
  const verdict = await paymentPolicy(p);
  if (!verdict.eligible) throw new BillingError(verdict.reason ?? "This payment isn't eligible for a refund.");
  const req = await prisma.refundRequest.create({ data: { userId, paymentId: p.id, reason: reason.reason } });
  const ref = `RF-${req.id.slice(-6).toUpperCase()}`;
  await Promise.allSettled([
    sendSupportCaseNotice(ref, `Refund request: ${rupees(p.amount)} (${p.description ?? p.kind})`, `${p.user.email} asks for a refund of payment ${p.razorpayPaymentId}.\n\nReason: ${reason.reason}\n\nReview it: ${siteUrl}/admin/refunds`, p.user.email),
    sendEventEmail(p.user.email, {
      subject: `We've received your refund request (${ref})`,
      headline: "Your refund request is with our team",
      body: `Thanks${p.user.name ? `, ${p.user.name.split(" ")[0]}` : ""} — we've received your request to refund ${rupees(p.amount)} (${p.description ?? "your payment"}). We'll look at it and email you the decision, usually within 3 working days. If it's approved, the money returns to the payment method you used and you'll get a credit note. As our policy says, ${rupees(verdict.feePaise)} is kept as a charge, so the refund would be ${rupees(verdict.refundPaise)}, and your plan would end.\n\nReference: ${ref}`,
      link: `${siteUrl}/app/account/payments`,
      linkLabel: "See your payments",
    }),
  ]).then((rs) => rs.forEach((r) => r.status === "rejected" && logError("refund.request-email", r.reason)));
  return { id: req.id, ref };
}

export type IssueInput = {
  paymentId: string;
  amountPaise: number;
  requestId?: string | null;
  /** Subscription payments: stop the plan now (the account moves to Free). */
  cancelPlan?: boolean;
  /** Top-up payments: take the credits back (never more than the customer still has). */
  takeBackCredits?: boolean;
  note?: string | null;
  staff: { id: string; email: string };
};

/** Staff approve: refund through Razorpay, record it (credit note goes out), apply the chosen account changes. */
export async function issueRefund(i: IssueInput): Promise<{ refundId: string; amountPaise: number; cancelledPlan: boolean; creditsTakenBack: number }> {
  const p = await prisma.payment.findUnique({ where: { id: i.paymentId } });
  if (!p) throw new BillingError("Payment not found.");
  if (p.status !== "captured" || p.refundedAt) throw new BillingError("This payment can't be refunded (already refunded, or not completed).");
  const bad = refundAmountProblem(i.amountPaise, p.amount);
  if (bad) throw new BillingError(bad);

  // The money first: if Razorpay refuses, nothing else changes.
  const refund = await rzp.refundPayment(p.razorpayPaymentId, i.amountPaise, { by: i.staff.email.slice(0, 60), requestId: i.requestId ?? "", note: (i.note ?? "").slice(0, 200) });

  let cancelledPlan = false;
  let creditsTakenBack = 0;
  try {
    if (i.cancelPlan && p.kind === "subscription" && p.subscriptionId) {
      const sub = await prisma.subscription.findUnique({ where: { id: p.subscriptionId } });
      if (sub && !["cancelled", "completed"].includes(sub.status)) {
        await rzp.cancelSubscription(sub.razorpaySubscriptionId, false).catch((e) => logError("refund.cancel-subscription", e));
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
      }
      await setPlan(p.userId, "FREE", { source: "refund", paymentId: p.razorpayPaymentId });
      cancelledPlan = true;
    }
    if (i.takeBackCredits && p.kind === "topup" && p.creditsGranted) {
      const acct = await prisma.creditAccount.findUnique({ where: { userId: p.userId } });
      if (acct) {
        creditsTakenBack = creditsToTakeBack(p.creditsGranted, acct.topupBalance);
        if (creditsTakenBack > 0) {
          const updated = await prisma.creditAccount.update({ where: { userId: p.userId }, data: { topupBalance: { decrement: creditsTakenBack } } });
          await prisma.creditEvent.create({ data: { userId: p.userId, kind: "TOPUP_REFUND", credits: -creditsTakenBack, monthlyAfter: updated.monthlyBalance, topupAfter: updated.topupBalance, meta: { source: "refund", paymentId: p.razorpayPaymentId } } });
        }
      }
    }
  } catch (err) {
    // The refund has happened; the account change didn't. Say so loudly instead of hiding it.
    logError("refund.account-change", err, { paymentId: p.id });
  }

  await recordRefund({ razorpayPaymentId: p.razorpayPaymentId, amountPaise: i.amountPaise, refundId: refund.id, byStaff: true });
  if (i.requestId) {
    await prisma.refundRequest.updateMany({
      where: { id: i.requestId, status: "PENDING" },
      data: { status: "REFUNDED", decisionNote: i.note ?? null, decidedById: i.staff.id, decidedAt: new Date(), razorpayRefundId: refund.id, refundedAmount: i.amountPaise, cancelledPlan, creditsTakenBack },
    });
  }
  return { refundId: refund.id, amountPaise: i.amountPaise, cancelledPlan, creditsTakenBack };
}

/** Staff decline: the request closes and the customer is told, with the reason. */
export async function rejectRefund(requestId: string, note: string, staff: { id: string }): Promise<void> {
  const clean = note.replace(/\s+/g, " ").trim();
  if (clean.length < 5) throw new BillingError("Write a short reason the customer will see.");
  const r = await prisma.refundRequest.findUnique({ where: { id: requestId }, include: { user: { select: { email: true } }, payment: { select: { amount: true, description: true } } } });
  if (!r || r.status !== "PENDING") throw new BillingError("This request has already been decided.");
  await prisma.refundRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decisionNote: clean.slice(0, 600), decidedById: staff.id, decidedAt: new Date() } });
  await sendEventEmail(r.user.email, {
    subject: "About your refund request",
    headline: "We're not able to refund this payment",
    body: `We looked at your request to refund ${rupees(r.payment.amount)} (${r.payment.description ?? "your payment"}) and we're not able to approve it.\n\n${clean}\n\nIf you think we've got this wrong, just reply to this email or write to support@myalgoagent.com and we'll look again.`,
    link: `${siteUrl}/app/account/payments`,
    linkLabel: "See your payments",
  }).catch((e) => logError("refund.decline-email", e));
}
