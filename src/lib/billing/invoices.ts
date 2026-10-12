import "server-only";
import { prisma } from "@/lib/prisma";
import { sendInvoiceEmail } from "@/lib/email";
import { logError } from "@/lib/logger";
import { PLANS } from "@/lib/credits/config";
import { financialYear, invoiceHtml, invoiceNumber, invoiceText, rupees, type InvoiceModel } from "./invoice";

// Giving each payment its invoice number (in sequence, per financial year) and sending the invoice once.

const SITE = "https://myalgoagent.com";
const COMPANY = () => ({
  name: process.env.COMPANY_LEGAL_NAME?.trim() || "Shagoon Softech Pvt. Ltd.",
  address: process.env.COMPANY_ADDRESS?.trim() || null,
  gstin: process.env.COMPANY_GSTIN?.trim() || null,
  pan: process.env.COMPANY_PAN?.trim() || null,
  sac: process.env.COMPANY_SAC?.trim() || null,
});

type PaymentRow = NonNullable<Awaited<ReturnType<typeof prisma.payment.findUnique>>>;

/** The payment's invoice number; made now (and never again) the first time it's asked for. Numbers are gapless per financial year. */
export async function ensureInvoiceNumber(paymentId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { invoiceNumber: true, createdAt: true } });
    if (p.invoiceNumber) return p.invoiceNumber;
    const fy = financialYear(p.createdAt);
    const counter = await tx.invoiceCounter.upsert({ where: { fy }, create: { fy, last: 1 }, update: { last: { increment: 1 } } });
    const number = invoiceNumber(fy, counter.last);
    await tx.payment.update({ where: { id: paymentId }, data: { invoiceNumber: number } });
    return number;
  });
}

const monthDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export async function invoiceModelFor(p: PaymentRow): Promise<InvoiceModel> {
  const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { name: true, email: true } });
  const co = COMPANY();
  const number = p.invoiceNumber ?? (await ensureInvoiceNumber(p.id));
  const sub = p.subscriptionId ? await prisma.subscription.findUnique({ where: { id: p.subscriptionId }, select: { plan: true } }) : null;
  const line =
    p.kind === "topup"
      ? { description: "Credit top-up", detail: `${(p.creditsGranted ?? 0).toLocaleString("en-IN")} credits · kept for a year`, qty: 1, totalPaise: p.amount, sac: co.sac }
      : { description: `MyAlgoAgent ${sub ? PLANS[sub.plan].label : "plan"} plan`, detail: p.periodStart && p.periodEnd ? `Monthly · ${monthDay(p.periodStart)} – ${monthDay(p.periodEnd)}` : "Monthly subscription", qty: 1, totalPaise: p.amount, sac: co.sac };
  return {
    title: co.gstin ? "TAX INVOICE" : "PAYMENT RECEIPT",
    number,
    date: p.createdAt,
    paymentId: p.razorpayPaymentId,
    method: p.method,
    status: p.status === "refunded" ? "REFUNDED" : "PAID",
    buyer: { name: user?.name ?? "", email: user?.email ?? "" },
    seller: { name: co.name, address: co.address, gstin: co.gstin, pan: co.pan, email: "support@myalgoagent.com", website: SITE },
    lines: [line],
  };
}

/** Numbers the invoice and emails it, once. Never throws: a mail problem must not undo a payment. */
export async function sendInvoiceOnce(paymentId: string): Promise<void> {
  try {
    const claimed = await prisma.payment.updateMany({ where: { id: paymentId, invoiceSentAt: null, status: "captured" }, data: { invoiceSentAt: new Date() } });
    if (!claimed.count) return;
    try {
      const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const model = await invoiceModelFor(p);
      if (!model.buyer.email) throw new Error("no email address");
      await sendInvoiceEmail(model.buyer.email, {
        number: model.number,
        totalLabel: rupees(p.amount),
        invoiceHtml: invoiceHtml(model),
        text: invoiceText(model),
        viewUrl: `${SITE}/invoice/${p.id}`,
        billingUrl: `${SITE}/app/account/usage`,
      });
    } catch (err) {
      await prisma.payment.updateMany({ where: { id: paymentId }, data: { invoiceSentAt: null } }); // try again on the next occasion
      throw err;
    }
  } catch (err) {
    logError("billing.invoice-email", err, { paymentId });
  }
}
