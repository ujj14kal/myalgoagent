import Link from "next/link";
import type { StrategyPerformance } from "@/lib/portfolio";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  DRAFT: "bg-brand-navy/10 text-brand-navy/60",
  ARCHIVED: "bg-brand-sell/10 text-brand-sell",
};

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) {
    return <div className="h-8 w-20 shrink-0" />;
  }
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0">
      <path d={path} fill="none" stroke={positive ? "#00a83e" : "#d60000"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StrategyPerformanceList({ strategies }: { strategies: StrategyPerformance[] }) {
  if (strategies.length === 0) {
    return (
      <div data-tour="strategies-list" className="py-6 text-center text-sm text-brand-navy/40">
        No strategies yet —{" "}
        <Link href="/app/strategies/new" className="text-brand-primary hover:underline">
          build your first one
        </Link>
        .
      </div>
    );
  }

  return (
    <div data-tour="strategies-list" className="divide-y divide-black/5">
      {strategies.map((s) => (
        <Link
          key={s.id}
          href={`/app/strategies/${s.id}`}
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-brand-bg/60"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-brand-navy">{s.name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[s.status]}`}>
                {s.status}
              </span>
            </div>
            <p className="text-xs text-brand-navy/50">{s.instrumentSymbol}</p>
          </div>
          <Sparkline points={s.sparkline} positive={s.todayPnl >= 0} />
          <p className={`w-24 shrink-0 text-right text-sm font-semibold ${s.todayPnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
            {s.todayPnl >= 0 ? "+" : ""}
            ₹{s.todayPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </Link>
      ))}
    </div>
  );
}
