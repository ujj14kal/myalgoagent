import Link from "next/link";
import { Activity, FlaskConical, Plus, Star, type LucideIcon } from "lucide-react";

const ACTIONS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/app/strategies/new", label: "New strategy", description: "Build rules visually or as code", icon: Plus },
  { href: "/app/backtests", label: "Run a backtest", description: "Test on real historical data", icon: FlaskConical },
  { href: "/app/paper-trading", label: "Paper trade", description: "Run live on virtual capital", icon: Activity },
  { href: "/app/watchlist", label: "Watchlist", description: "Track instruments you follow", icon: Star },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group rounded-2xl border border-black/[0.06] bg-white p-3.5 transition-all hover:border-brand-primary/25 hover:bg-white hover:shadow-[var(--shadow-card-hover)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/[0.08] text-brand-primary transition-colors group-hover:bg-brand-primary group-hover:text-white">
            <a.icon size={17} strokeWidth={2.2} />
          </span>
          <span className="mt-2.5 block text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{a.label}</span>
          <span className="block text-xs text-brand-navy/50">{a.description}</span>
        </Link>
      ))}
    </div>
  );
}
