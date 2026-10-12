import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceHtml } from "@/lib/billing/invoice";
import { creditNoteModelFor, invoiceModelFor } from "@/lib/billing/invoices";
import PrintButton from "@/components/billing/print-button";

// One invoice, on its own clean page (no app chrome) so printing or "Save as PDF" gives just the invoice. Only its owner can open it.
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ "credit-note"?: string }> }) {
  const { id } = await params;
  const wantsCreditNote = (await searchParams)["credit-note"] === "1";
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(`/invoice/${id}`)}`);
  const payment = await prisma.payment.findFirst({ where: { id, userId, status: { in: ["captured", "refunded"] } } });
  if (!payment) notFound();
  if (wantsCreditNote && !payment.refundedAt) notFound();
  const html = invoiceHtml(wantsCreditNote ? await creditNoteModelFor(payment) : await invoiceModelFor(payment));
  return (
    <main className="min-h-screen bg-brand-bg px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[680px] items-center justify-between print:hidden">
        <Link href="/app/account/usage" className="text-sm font-semibold text-brand-primary hover:underline">← Plan, credits &amp; billing</Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[680px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
