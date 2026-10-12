import { notFound } from "next/navigation";
import { invoiceHtml, type InvoiceModel } from "@/lib/billing/invoice";

// Development only: the invoice with made-up data so its design can be checked. ?kind=topup | receipt | refund. Not served in production.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kind } = await searchParams;
  const base: InvoiceModel = {
    title: kind === "receipt" ? "PAYMENT RECEIPT" : kind === "credit" ? "CREDIT NOTE" : "TAX INVOICE",
    number: "MAA/2026-27/000128",
    date: new Date("2026-10-13T06:00:00Z"),
    paymentId: "pay_Tn6M2xK9QaLb7R",
    method: "upi",
    status: kind === "refund" || kind === "credit" ? "REFUNDED" : "PAID",
    ...(kind === "credit" ? { creditNote: { against: "MAA/2026-27/000128", againstDate: new Date("2026-10-12T06:00:00Z") } } : {}),
    buyer: { name: "Asha Rao", email: "asha.rao@example.com", ...(kind === "business" ? { gstin: "29ABCDE1234F1Z5", address: "12 MG Road, Bengaluru 560001" } : {}) },
    seller: kind === "receipt" ? { name: "Shagoon Softech Pvt. Ltd.", email: "support@myalgoagent.com", website: "https://myalgoagent.com" } : { name: "Shagoon Softech Pvt. Ltd.", address: "Registered office address, City, State PIN", gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F", email: "support@myalgoagent.com", website: "https://myalgoagent.com" },
    lines: kind === "topup" ? [{ description: "Credit top-up", detail: "750 credits · valid for a year", qty: 1, totalPaise: 79_900, sac: "998439" }] : [{ description: "MyAlgoAgent Trade plan", detail: "Monthly · 13 Oct 2026 – 12 Nov 2026", qty: 1, totalPaise: 199_900, sac: kind === "receipt" ? null : "998439" }],
  };
  return (
    <main style={{ background: "#f7f9fc", padding: "24px 12px", minHeight: "100vh" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", border: "1px solid #e6eaf0", borderRadius: 16, overflow: "hidden", background: "#fff" }} dangerouslySetInnerHTML={{ __html: invoiceHtml(base) }} />
    </main>
  );
}
