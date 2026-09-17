import Link from "next/link";
import type { RecentBacktestRow } from "@/lib/portfolio";

export default function RecentBacktests({ runs }: { runs: RecentBacktestRow[] }) {
  if (runs.length === 0) {
    return (
      <p className="py-4 text-sm text-brand-navy/40">
        No backtests run yet.{" "}
        <Link href="/app/backtests" className="text-brand-primary hover:underline">
          Run one →
        </Link>
      </p>
    );
  }

  return (
    <ul className="divide-y divide-black/5">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/app/backtests/${r.id}`}
            className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand-primary"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-brand-navy">{r.strategyName}</p>
              <p className="text-xs text-brand-navy/50">
                {r.instrumentSymbol} · {r.range}
              </p>
            </div>
            <span className={`shrink-0 font-semibold ${r.totalReturnPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
              {r.totalReturnPct >= 0 ? "+" : ""}
              {r.totalReturnPct.toFixed(2)}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
