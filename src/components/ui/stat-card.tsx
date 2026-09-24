import type { LucideIcon } from "lucide-react";
import { TONE_TEXT, type Tone } from "@/lib/format";

/** A single headline figure. `tone` colors the value (flat = neutral grey). */
export default function StatCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  accent?: "primary" | "gold" | "blue" | "buy" | "sell";
}) {
  // Icons stay quiet — color is reserved for the figure's own gain/loss.
  const ACCENT = {
    primary: "bg-brand-navy/[0.04] text-brand-navy/45",
    gold: "bg-brand-navy/[0.04] text-brand-navy/45",
    blue: "bg-brand-navy/[0.04] text-brand-navy/45",
    buy: "bg-brand-navy/[0.04] text-brand-navy/45",
    sell: "bg-brand-navy/[0.04] text-brand-navy/45",
  }[accent];
  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-navy/45">{label}</p>
        {Icon && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ACCENT}`}>
            <Icon size={14} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <p className={`num mt-2 text-xl font-bold tracking-tight sm:text-2xl ${tone ? TONE_TEXT[tone] : "text-brand-navy"}`}>{value}</p>
      {sub && <div className="mt-1 text-xs text-brand-navy/50">{sub}</div>}
    </div>
  );
}
