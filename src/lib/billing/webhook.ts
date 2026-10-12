import "server-only";
import { prisma } from "@/lib/prisma";
import { setPlan } from "@/lib/credits/service";
import { logError } from "@/lib/logger";
import { creditTopup, recordRefund, recordSubscriptionPayment, syncSubscription } from "./service";
import { fetchOrder, type RzpSubscription } from "./razorpay";

// Razorpay tells us what happened (charged, failed, cancelled…) with a signed message. Each event has an id, recorded the
// first time it is handled, so a repeated delivery does nothing. The subscription's own state is re-read from Razorpay
// rather than trusted from the message.

type Entity<T> = { entity: T };
export type RzpEvent = {
  event: string;
  payload: {
    subscription?: Entity<RzpSubscription>;
    refund?: Entity<{ id: string; payment_id: string; amount: number; status?: string }>;
    payment?: Entity<{ id: string; order_id?: string; amount: number; currency: string; status: string; method?: string; description?: string; notes?: Record<string, string> }>;
  };
};

export async function handleEvent(eventId: string, e: RzpEvent): Promise<"handled" | "duplicate" | "ignored"> {
  try {
    await prisma.billingEvent.create({ data: { id: eventId, type: e.event } });
  } catch {
    return "duplicate";
  }
  try {
    const sub = e.payload.subscription?.entity;
    const pay = e.payload.payment?.entity;
    switch (e.event) {
      case "subscription.authenticated":
      case "subscription.activated":
      case "subscription.updated":
      case "subscription.pending":
        if (sub) await syncSubscription(sub.id);
        return "handled";
      case "subscription.charged": {
        if (!sub) return "ignored";
        const row = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: sub.id } });
        await syncSubscription(sub.id); // first, so the payment is recorded against the period it paid for
        if (row && pay) await recordSubscriptionPayment(row.id, pay.id);
        return "handled";
      }
      case "subscription.halted": // every retry of a renewal failed
      case "subscription.cancelled":
      case "subscription.completed": {
        if (!sub) return "ignored";
        const row = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: sub.id } });
        if (!row) return "ignored";
        await prisma.subscription.update({ where: { id: row.id }, data: { status: sub.status } });
        // Back to Free only if no other subscription of theirs is still running (an upgrade cancels the old one).
        const running = await prisma.subscription.count({ where: { userId: row.userId, id: { not: row.id }, status: { in: ["active", "authenticated"] } } });
        if (!running) await setPlan(row.userId, "FREE", { source: "razorpay", reason: e.event });
        return "handled";
      }
      case "refund.processed": {
        const refund = e.payload.refund?.entity;
        if (!refund?.payment_id) return "ignored";
        await recordRefund({ razorpayPaymentId: refund.payment_id, amountPaise: refund.amount, refundId: refund.id });
        return "handled";
      }
      case "payment.failed": {
        // A failed renewal is retried by Razorpay; it is only recorded here (the halted event is what ends the plan).
        if (pay && pay.notes?.userId) {
          await prisma.payment.create({ data: { userId: pay.notes.userId, razorpayPaymentId: pay.id, razorpayOrderId: pay.order_id ?? null, kind: pay.notes.kind === "topup" ? "topup" : "subscription", amount: pay.amount, status: "failed", method: pay.method ?? null } }).catch(() => undefined);
        }
        return "handled";
      }
      case "payment.captured":
      case "order.paid": {
        // A top-up paid in the browser is credited by the confirm step; this is the safety net if the browser closed first.
        // The order carries what was bought (and by whom), so it is read from Razorpay rather than trusted from the message.
        if (pay?.order_id) {
          const order = await fetchOrder(pay.order_id);
          if (order.notes?.kind === "topup" && order.notes.userId) {
            await creditTopup({ userId: order.notes.userId, credits: Number(order.notes.credits), paymentId: pay.id, orderId: order.id, amountPaise: pay.amount, method: pay.method });
          }
        }
        return "handled";
      }
      default:
        return "ignored";
    }
  } catch (err) {
    // Let Razorpay retry: forget we saw this event.
    await prisma.billingEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    logError("billing.webhook", err);
    throw err;
  }
}
