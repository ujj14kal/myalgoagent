import Link from "next/link";
import { FlaskConical } from "lucide-react";
import EmptyCard from "@/components/dashboard/empty-card";
import type { RecentBacktestRow } from "@/lib/portfolio";
import { formatPct, toneOf, TONE_TEXT } from "@/lib/format";

export default function RecentBacktests({ runs }: { runs: RecentBacktestRow[] }) {
  if (runs.length === 0) {
    return <EmptyCard icon={FlaskConical} title="No backtests yet" hint="Test a strategy on real past prices before you forward test it." href="/app/backtests" cta="Run a backtest" />;
  }
  return (
    <ul className="-mx-2">
      {runs.map((r) => {
        const tone = toneOf(r.totalReturnPct);
        return (
          <li key={r.id}>
            <Link href={`/app/backtests/${r.id}`} className="group flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-brand-primary/[0.04]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-navy group-hover:text-brand-primary">{r.strategyName}</p>
                <p className="text-xs text-brand-navy/50">
                  {r.instrumentSymbol} · {r.range}
                </p>
              </div>
              <span className={`num shrink-0 rounded-lg px-2 py-1 text-sm font-semibold ${TONE_TEXT[tone]} ${tone === "up" ? "bg-brand-buy/[0.08]" : tone === "down" ? "bg-brand-sell/[0.07]" : "bg-brand-navy/5"}`}>
                {formatPct(r.totalReturnPct)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
