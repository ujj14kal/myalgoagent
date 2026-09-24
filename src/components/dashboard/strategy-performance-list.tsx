import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { StrategyPerformance } from "@/lib/portfolio";
import StatusBadge from "@/components/ui/status-badge";
import { formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-8 w-20 shrink-0" />;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const tone = toneOf(points.at(-1)! - points[0]);
  const color = tone === "up" ? "#00a83e" : tone === "down" ? "#d60000" : "#4a5a6e";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="hidden shrink-0 sm:block" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StrategyPerformanceList({ strategies }: { strategies: StrategyPerformance[] }) {
  if (strategies.length === 0) {
    return (
      <div data-tour="strategies-list" className="py-8 text-center text-sm text-brand-navy/45">
        No strategies yet —{" "}
        <Link href="/app/strategies/new" className="font-semibold text-brand-primary hover:underline">
          build your first one
        </Link>
        .
      </div>
    );
  }

  return (
    <ul data-tour="strategies-list" className="-mx-2">
      {strategies.map((s) => {
        const tone = toneOf(s.todayPnl);
        return (
          <li key={s.id}>
            <Link
              href={`/app/strategies/${s.id}`}
              className="group flex items-center gap-4 rounded-xl px-2 py-2.5 transition-colors hover:bg-brand-primary/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{s.name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-brand-navy/50">{s.instrumentSymbol}</p>
              </div>
              <Sparkline points={s.sparkline} />
              <p className={`num w-24 shrink-0 text-right text-sm font-semibold ${TONE_TEXT[tone]}`}>{formatSignedINR(s.todayPnl)}</p>
              <ChevronRight size={16} className="shrink-0 text-brand-navy/20 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
