import Link from "next/link";
import RefundRequestButton from "./refund-request-button";

/** Where a refund stands for one payment: nothing yet (can ask), asked, declined, or done (with the amount and the credit note). */
export type RefundState = { kind: "can-request"; refundPaise: number; feePaise: number } | { kind: "not-eligible"; reason: string } | { kind: "requested" } | { kind: "declined" } | { kind: "refunded"; amount: number; creditNote: string | null } | { kind: "none" };
export type PaymentRow = { id: string; when: string; what: string; amount: number; status: string; invoice: string | null; refund?: RefundState };
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/** The payments list: wraps on narrow screens instead of running off the page, with the invoice link last. */
export default function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead>
          <tr>
            <th>When (IST)</th>
            <th>For</th>
            <th className="num-cell">Amount</th>
            <th>Status</th>
            <th>Invoice</th>
            <th>Refund</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap">{p.when}</td>
              <td className="min-w-[8rem] break-words">{p.what}</td>
              <td className="num-cell whitespace-nowrap tabular-nums">₹{(p.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              <td className={p.status === "captured" ? "text-[#0b6b30]" : p.status === "refunded" ? "text-brand-navy/60" : "text-[#9b1111]"}>{p.status === "captured" ? "paid" : p.status}</td>
              <td className="whitespace-nowrap">{p.status === "captured" || p.status === "refunded" ? <Link href={`/invoice/${p.id}`} className="font-semibold text-brand-primary hover:underline">{p.invoice ?? "View"}</Link> : "—"}</td>
              <td className="whitespace-nowrap text-xs">
                {p.refund?.kind === "can-request" && <RefundRequestButton paymentId={p.id} amountLabel={inr(p.amount)} refundLabel={inr(p.refund.refundPaise)} feeLabel={inr(p.refund.feePaise)} />}
                {p.refund?.kind === "not-eligible" && <span className="cursor-help text-brand-navy/45" title={p.refund.reason}>Not refundable</span>}
                {p.refund?.kind === "requested" && <span className="font-semibold text-[#7a5a00]">Refund requested</span>}
                {p.refund?.kind === "declined" && <span className="text-brand-navy/55">Request declined</span>}
                {p.refund?.kind === "refunded" && (
                  <span className="text-brand-navy/70">
                    Refunded {inr(p.refund.amount)}
                    {p.refund.creditNote && <> · <Link href={`/invoice/${p.id}?credit-note=1`} className="font-semibold text-brand-primary hover:underline">{p.refund.creditNote}</Link></>}
                  </span>
                )}
                {(!p.refund || p.refund.kind === "none") && "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
