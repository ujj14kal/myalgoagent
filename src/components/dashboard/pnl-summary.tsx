import type { PeriodPnl } from "@/lib/portfolio";

function fmt(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function PnlSummary({ pnl }: { pnl: PeriodPnl }) {
  const rows: { label: string; value: number }[] = [
    { label: "Today", value: pnl.today },
    { label: "This week", value: pnl.week },
    { label: "This month", value: pnl.month },
    { label: "All time", value: pnl.allTime },
  ];

  return (
    <div data-tour="pnl-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="hover-lift rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{r.label}</p>
          <p className={`mt-2 text-xl font-bold ${r.value >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
            {fmt(r.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
