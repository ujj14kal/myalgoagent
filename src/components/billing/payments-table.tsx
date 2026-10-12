import Link from "next/link";

export type PaymentRow = { id: string; when: string; what: string; amount: number; status: string; invoice: string | null };

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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
