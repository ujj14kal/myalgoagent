import Link from "next/link";
import { Star } from "lucide-react";
import EmptyCard from "@/components/dashboard/empty-card";

export default function WatchlistSnippet({ items }: { items: { symbol: string; name: string }[] }) {
  if (items.length === 0) {
    return <EmptyCard icon={Star} title="Nothing on your watchlist" hint="Follow stocks and coins to see them here." href="/app/watchlist" cta="Add instruments" />;
  }
  return (
    <ul className="-mx-2">
      {items.map((w) => (
        <li key={w.symbol}>
          <Link href={`/app/instruments/${encodeURIComponent(w.symbol)}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-brand-primary/[0.04]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
              {w.symbol.slice(0, 2)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{w.symbol}</span>
              <span className="block truncate text-xs text-brand-navy/50">{w.name}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
