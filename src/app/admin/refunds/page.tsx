import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { AdminPageHeader, Card, Empty, Pill, ago, ist } from "@/components/admin/ui";
import RefundForm from "@/components/admin/refund-form";
import { rupees } from "@/lib/billing/invoice";

export const dynamic = "force-dynamic";

const days = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
const asRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export default async function RefundsPage() {
  await requireStaff("billing");
  const [pending, recent, refundable] = await Promise.all([
    prisma.refundRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, email: true, name: true } }, payment: true } }),
    prisma.refundRequest.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15, include: { user: { select: { email: true } }, payment: { select: { amount: true, description: true, creditNoteNumber: true } } } }),
    prisma.payment.findMany({ where: { status: "captured", refundedAt: null, refundRequests: { none: { status: "PENDING" } } }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { id: true, email: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Refunds" icon={RotateCcw} description="Customers ask from their Payments page; you decide here. Approving sends the money back through Razorpay, emails the credit note, and (if you choose) cancels the plan or takes top-up credits back." />

      <Card title={`Waiting for a decision (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>No refund requests waiting. 🎉</Empty>
        ) : (
          <ul className="space-y-5">
            {pending.map((r) => (
              <li key={r.id} className="rounded-2xl border border-black/[0.06] p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/admin/users/${r.user.id}`} className="font-semibold text-brand-primary hover:underline">{r.user.email}</Link>
                  <Pill tone="gold" dot>asked {ago(r.createdAt)}</Pill>
                  <span className="text-xs text-brand-navy/45">RF-{r.id.slice(-6).toUpperCase()}</span>
                </div>
                <p className="mt-2 text-sm text-brand-navy">
                  <strong>{rupees(r.payment.amount)}</strong> · {r.payment.description ?? r.payment.kind} · paid {ist(r.payment.createdAt)} ({days(r.payment.createdAt)} days ago) · {r.payment.method ?? "online"} · <span className="font-mono text-xs">{r.payment.razorpayPaymentId}</span>
                </p>
                <p className="mt-2 rounded-lg bg-brand-bg px-3 py-2 text-sm text-brand-navy/80"><span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Their reason</span><br />{r.reason}</p>
                <RefundForm paymentId={r.paymentId} requestId={r.id} paidRupees={asRupees(r.payment.amount)} kind={r.payment.kind === "topup" ? "topup" : "subscription"} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Refund a payment directly" pad={false}>
        {refundable.length === 0 ? (
          <Empty>No refundable payments yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {refundable.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold tabular-nums text-brand-navy">{rupees(p.amount)}</span>
                    <span className="text-brand-navy/70">{p.description ?? p.kind}</span>
                    <Link href={`/admin/users/${p.user.id}`} className="text-brand-primary hover:underline">{p.user.email}</Link>
                    <span className="text-xs text-brand-navy/45">{ist(p.createdAt)} · {days(p.createdAt)}d ago</span>
                    <span className="ml-auto text-xs font-semibold text-brand-primary">Refund…</span>
                  </summary>
                  <RefundForm paymentId={p.id} requestId={null} paidRupees={asRupees(p.amount)} kind={p.kind === "topup" ? "topup" : "subscription"} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recently decided" pad={false}>
        {recent.length === 0 ? (
          <Empty>Nothing decided yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                <Pill tone={r.status === "REFUNDED" ? "green" : "gray"} dot>{r.status === "REFUNDED" ? "refunded" : "declined"}</Pill>
                <span className="text-brand-navy">{r.user.email}</span>
                <span className="tabular-nums text-brand-navy/70">{r.status === "REFUNDED" && r.refundedAmount ? rupees(r.refundedAmount) : rupees(r.payment.amount)}</span>
                {r.payment.creditNoteNumber && <span className="font-mono text-xs text-brand-navy/50">{r.payment.creditNoteNumber}</span>}
                {r.cancelledPlan && <Pill tone="gold">plan cancelled</Pill>}
                {r.creditsTakenBack ? <Pill tone="gold">{r.creditsTakenBack.toLocaleString("en-IN")} credits taken back</Pill> : null}
                {r.decisionNote && <span className="text-xs text-brand-navy/50">“{r.decisionNote}”</span>}
                <span className="ml-auto text-xs text-brand-navy/40">{ago(r.decidedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
