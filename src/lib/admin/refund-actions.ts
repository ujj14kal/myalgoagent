"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, StaffError } from "@/lib/admin/access";
import { audit } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { rupees } from "@/lib/billing/invoice";
import { issueRefund, rejectRefund } from "@/lib/billing/refunds";
import { BillingError } from "@/lib/billing/service";
import { RazorpayError } from "@/lib/billing/razorpay";
import { rupeesToPaise } from "@/lib/billing/refund-rules";

// Refunding is the one admin action that moves money out, so it needs the "billing" capability (admins and the owner),
// is written to the audit log, and reports back in plain words (results are returned, not thrown).

export type RefundResult = { ok: true; message: string } | { ok: false; error: string };

async function guarded(fn: () => Promise<RefundResult>): Promise<RefundResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StaffError || err instanceof BillingError) return { ok: false, error: err.message };
    if (err instanceof RazorpayError) return { ok: false, error: `Razorpay said: ${err.message}` };
    logError("admin.refund", err);
    return { ok: false, error: "Something went wrong — it's been logged. Check the payment in Razorpay before trying again." };
  }
}

export async function approveRefund(input: { paymentId: string; requestId?: string | null; amount: string; cancelPlan: boolean; takeBackCredits: boolean; note: string }): Promise<RefundResult> {
  return guarded(async () => {
    const staff = await assertStaff("billing");
    const amountPaise = rupeesToPaise(input.amount);
    if (!Number.isFinite(amountPaise)) return { ok: false, error: "Enter the amount in rupees, like 1999 or 999.50." };
    const done = await issueRefund({ paymentId: input.paymentId, amountPaise, requestId: input.requestId ?? null, cancelPlan: input.cancelPlan, takeBackCredits: input.takeBackCredits, note: input.note.slice(0, 300), staff });
    const p = await prisma.payment.findUnique({ where: { id: input.paymentId }, select: { userId: true, razorpayPaymentId: true } });
    await audit(staff, "refund.issue", { type: "payment", id: input.paymentId }, `Refunded ${rupees(done.amountPaise)}`, { refundId: done.refundId, userId: p?.userId ?? null, razorpayPaymentId: p?.razorpayPaymentId ?? null, cancelledPlan: done.cancelledPlan, creditsTakenBack: done.creditsTakenBack });
    revalidatePath("/admin/refunds");
    return { ok: true, message: `Refunded ${rupees(done.amountPaise)} (Razorpay ${done.refundId}). The credit note is being emailed.${done.cancelledPlan ? " The plan was cancelled." : ""}${done.creditsTakenBack ? ` ${done.creditsTakenBack.toLocaleString("en-IN")} credits were taken back.` : ""}` };
  });
}

export async function declineRefund(input: { requestId: string; note: string }): Promise<RefundResult> {
  return guarded(async () => {
    const staff = await assertStaff("billing");
    await rejectRefund(input.requestId, input.note, staff);
    await audit(staff, "refund.decline", { type: "refundRequest", id: input.requestId }, "Declined a refund request", { note: input.note.slice(0, 300) });
    revalidatePath("/admin/refunds");
    return { ok: true, message: "Declined. The customer has been told, with your reason." };
  });
}
