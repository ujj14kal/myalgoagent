import "server-only";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PLANS, TOPUP_PACKS } from "@/lib/credits/config";
import { grant, setPlan } from "@/lib/credits/service";
import { logError } from "@/lib/logger";
import { BRAND, PAID_PLANS, RAZORPAY_PLAN_ENV, SUBSCRIPTION_CYCLES, type PaidPlan } from "./brand";
import * as rzp from "./razorpay";
import { sendCreditNoteOnce, sendInvoiceOnce } from "./invoices";

// Paying for a plan or a credit top-up through Razorpay. The browser only ever sees public ids; the plan changes only after
// a payment signature (or a signed webhook) proves it happened, and every step can safely run twice.

export class BillingError extends Error {}
const keysOrThrow = () => {
  const k = rzp.razorpayKeys();
  if (!k) throw new BillingError("Online payment isn't switched on yet.");
  return k;
};

export const isPaidPlan = (v: unknown): v is PaidPlan => typeof v === "string" && (PAID_PLANS as string[]).includes(v);
const rupeesToPaise = (r: number) => Math.round(r * 100);

export type Checkout = {
  keyId: string;
  mode: "test" | "live";
  subscriptionId: string;
  plan: PaidPlan;
  planLabel: string;
  amountPaise: number;
  prefill: { name: string; email: string };
  brand: { name: string; logo: string; color: string };
};

/** Creates the autopay subscription the payment window will open on. Nothing changes on the account until it is paid. */
export async function startSubscriptionCheckout(userId: string, plan: PaidPlan): Promise<Checkout> {
  const keys = keysOrThrow();
  await enforceRateLimit(`billing:${userId}`, 10, 60_000);
  const planId = process.env[RAZORPAY_PLAN_ENV[plan]]?.trim();
  if (!planId) throw new BillingError("This plan isn't available for purchase yet.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, creditAccount: { select: { plan: true } } } });
  if (!user) throw new BillingError("Account not found.");
  const current = user.creditAccount?.plan ?? "FREE";
  if (current === plan) throw new BillingError(`You're already on ${PLANS[plan].label}.`);
  if (current === "PRO" && plan === "TRADE") throw new BillingError("To move from Pro to Trade, cancel Pro and choose Trade when it ends.");
  const sub = await rzp.createSubscription({ planId, totalCount: SUBSCRIPTION_CYCLES, notes: { userId, plan } });
  await prisma.subscription.create({ data: { userId, plan, razorpaySubscriptionId: sub.id, razorpayPlanId: planId, status: sub.status } });
  return {
    keyId: keys.keyId,
    mode: rzp.razorpayMode(keys.keyId),
    subscriptionId: sub.id,
    plan,
    planLabel: PLANS[plan].label,
    amountPaise: rupeesToPaise(PLANS[plan].price ?? 0),
    prefill: { name: user.name ?? "", email: user.email },
    brand: { name: BRAND.name, logo: BRAND.logoUrl, color: BRAND.color },
  };
}

type RzpSub = Awaited<ReturnType<typeof rzp.fetchSubscription>>;
const fromUnix = (n: number | null | undefined) => (n ? new Date(n * 1000) : null);

/** Brings our record in line with Razorpay's and, when it is paid and running, puts the account on the plan. Safe to repeat. */
export async function syncSubscription(razorpaySubscriptionId: string, latest?: RzpSub): Promise<{ plan: PaidPlan; status: string } | null> {
  const row = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId } });
  if (!row) return null;
  const s = latest ?? (await rzp.fetchSubscription(razorpaySubscriptionId));
  const periodStart = fromUnix(s.current_start);
  const newPeriod = !!periodStart && (!row.currentStart || periodStart.getTime() > row.currentStart.getTime());
  await prisma.subscription.update({
    where: { id: row.id },
    data: { status: s.status, currentStart: periodStart ?? row.currentStart, currentEnd: fromUnix(s.current_end) ?? row.currentEnd, paidCount: s.paid_count ?? row.paidCount },
  });
  if (s.status === "active" && (newPeriod || row.status !== "active")) {
    const plan = row.plan as PaidPlan;
    await setPlan(row.userId, plan, { source: "razorpay", subscription: razorpaySubscriptionId });
    // Moving up from Trade to Pro: the old subscription stops now, so they aren't charged for both.
    const others = await prisma.subscription.findMany({ where: { userId: row.userId, id: { not: row.id }, status: { in: ["active", "authenticated"] } } });
    for (const o of others) {
      await rzp.cancelSubscription(o.razorpaySubscriptionId, false).catch((e) => logError("billing.cancel-old", e));
      await prisma.subscription.update({ where: { id: o.id }, data: { status: "cancelled" } });
    }
  }
  return { plan: row.plan as PaidPlan, status: s.status };
}

/**
 * Records what Razorpay says was paid for a plan period (once: a repeat does nothing) and sends the invoice. Used by the browser's
 * confirmation and by the renewal webhook, so an invoice goes out even if one of them is late.
 */
export async function recordSubscriptionPayment(subscriptionRowId: string, razorpayPaymentId: string): Promise<void> {
  const row = await prisma.subscription.findUnique({ where: { id: subscriptionRowId } });
  if (!row) return;
  const pay = await rzp.fetchPayment(razorpayPaymentId);
  if (pay.status !== "captured") return;
  let paymentId: string | null = null;
  try {
    const created = await prisma.payment.create({
      data: { userId: row.userId, razorpayPaymentId: pay.id, razorpayOrderId: pay.order_id ?? null, subscriptionId: row.id, kind: "subscription", amount: pay.amount, currency: pay.currency, status: "captured", method: pay.method ?? null, description: `${PLANS[row.plan].label} plan`, periodStart: row.currentStart, periodEnd: row.currentEnd },
    });
    paymentId = created.id;
  } catch {
    paymentId = (await prisma.payment.findUnique({ where: { razorpayPaymentId: pay.id }, select: { id: true } }))?.id ?? null; // already recorded
  }
  if (paymentId) await sendInvoiceOnce(paymentId);
}

/** After the payment window closes with a success: prove it came from Razorpay, then sync. */
export async function confirmSubscriptionPayment(userId: string, p: { paymentId: string; subscriptionId: string; signature: string }) {
  const keys = keysOrThrow();
  if (!rzp.verifySubscriptionPayment(p, keys.keySecret)) throw new BillingError("We couldn't verify that payment.");
  const row = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: p.subscriptionId } });
  if (!row || row.userId !== userId) throw new BillingError("That payment doesn't belong to this account.");
  const result = await syncSubscription(p.subscriptionId);
  await recordSubscriptionPayment(row.id, p.paymentId).catch((err) => logError("billing.record-payment", err));
  return result;
}

/** Stops renewals; the plan stays until the period already paid for ends. */
export async function cancelSubscriptionAtPeriodEnd(userId: string): Promise<{ endsAt: Date | null }> {
  keysOrThrow();
  const row = await prisma.subscription.findFirst({ where: { userId, status: { in: ["active", "authenticated"] } }, orderBy: { createdAt: "desc" } });
  if (!row) throw new BillingError("There's no active subscription to cancel.");
  await rzp.cancelSubscription(row.razorpaySubscriptionId, true);
  await prisma.subscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: true } });
  return { endsAt: row.currentEnd };
}

// ---------- credit top-ups (one-off payments) ----------

export type TopupCheckout = { keyId: string; mode: "test" | "live"; orderId: string; credits: number; amountPaise: number; prefill: { name: string; email: string }; brand: Checkout["brand"] };
export async function startTopupCheckout(userId: string, credits: number): Promise<TopupCheckout> {
  const keys = keysOrThrow();
  await enforceRateLimit(`billing:${userId}`, 10, 60_000);
  const pack = TOPUP_PACKS.find((p) => p.credits === credits);
  if (!pack) throw new BillingError("Choose one of the credit packs.");
  const acct = await prisma.creditAccount.findUnique({ where: { userId }, select: { plan: true } });
  if (!acct || acct.plan === "FREE") throw new BillingError("Top-ups are for the Trade and Pro plans.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const order = await rzp.createOrder({ amountPaise: rupeesToPaise(pack.price), receipt: `topup_${userId.slice(-8)}_${Date.now()}`, notes: { userId, kind: "topup", credits: String(pack.credits) } });
  return { keyId: keys.keyId, mode: rzp.razorpayMode(keys.keyId), orderId: order.id, credits: pack.credits, amountPaise: order.amount, prefill: { name: user?.name ?? "", email: user?.email ?? "" }, brand: { name: BRAND.name, logo: BRAND.logoUrl, color: BRAND.color } };
}

/** Credits a paid top-up exactly once, whether the browser or the webhook gets here first. */
export async function creditTopup(args: { userId: string; credits: number; paymentId: string; orderId: string; amountPaise: number; method?: string | null }): Promise<boolean> {
  try {
    await prisma.payment.create({ data: { userId: args.userId, razorpayPaymentId: args.paymentId, razorpayOrderId: args.orderId, kind: "topup", amount: args.amountPaise, status: "captured", method: args.method ?? null, description: `${args.credits} credits`, creditsGranted: args.credits } });
  } catch {
    return false; // this payment was already credited
  }
  await grant(args.userId, args.credits, "TOPUP", { source: "razorpay", paymentId: args.paymentId });
  const created = await prisma.payment.findUnique({ where: { razorpayPaymentId: args.paymentId }, select: { id: true } });
  if (created) await sendInvoiceOnce(created.id);
  return true;
}

export async function confirmTopupPayment(userId: string, p: { orderId: string; paymentId: string; signature: string }) {
  const keys = keysOrThrow();
  if (!rzp.verifyOrderPayment(p, keys.keySecret)) throw new BillingError("We couldn't verify that payment.");
  const order = await rzp.fetchOrder(p.orderId);
  if (order.notes?.userId !== userId || order.notes?.kind !== "topup") throw new BillingError("That payment doesn't belong to this account.");
  const credits = Number(order.notes.credits);
  const pack = TOPUP_PACKS.find((x) => x.credits === credits);
  if (!pack || order.amount !== rupeesToPaise(pack.price)) throw new BillingError("That payment doesn't match a credit pack.");
  const added = await creditTopup({ userId, credits, paymentId: p.paymentId, orderId: p.orderId, amountPaise: order.amount });
  return { credits, added };
}

// ---------- refunds ----------

/**
 * A refund Razorpay has processed: remember it, and send the credit note (once). Plans and credits are NOT touched: what a refund
 * means for the account (stop the plan, take the credits back) is for a person to decide, so the team is alerted.
 */
export async function recordRefund(args: { razorpayPaymentId: string; amountPaise: number; refundId: string }): Promise<void> {
  const p = await prisma.payment.findUnique({ where: { razorpayPaymentId: args.razorpayPaymentId } });
  if (!p || p.creditNoteNumber || p.refundedAt) return; // not ours, or already handled
  const full = args.amountPaise >= p.amount;
  await prisma.payment.update({ where: { id: p.id }, data: { refundedAmount: args.amountPaise, refundedAt: new Date(), status: full ? "refunded" : p.status } });
  logError("billing.refund", new Error(`Refund ${args.refundId} of ₹${(args.amountPaise / 100).toFixed(2)} on ${p.kind} payment ${p.razorpayPaymentId} for user ${p.userId}: review their plan/credits`));
  await sendCreditNoteOnce(p.id);
}

