import Link from "next/link";

/** Only a refund that has already been issued by our team is shown (with its credit note). Customers never start one here: they write to support. */
export type RefundState = { kind: "refunded"; amount: number; creditNote: string | null } | { kind: "none" };
export type PaymentRow = { id: string; when: string; what: string; amount: number; status: string; invoice: string | null; refund?: RefundState };
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/** The payments list: wraps on narrow screens instead of running off the page, with the invoice link last. */
export default function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const anyRefund = rows.some((r) => r.refund?.kind === "refunded");
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
            {anyRefund && <th>Refunded</th>}
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
              {anyRefund && (
                <td className="whitespace-nowrap text-xs">
                  {p.refund?.kind === "refunded" ? (
                    <span className="text-brand-navy/70">
                      {inr(p.refund.amount)}
                      {p.refund.creditNote && <> · <Link href={`/invoice/${p.id}?credit-note=1`} className="font-semibold text-brand-primary hover:underline">{p.refund.creditNote}</Link></>}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
