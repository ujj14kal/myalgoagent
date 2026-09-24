import Link from "next/link";

export default function WatchlistSnippet({ items }: { items: { symbol: string; name: string }[] }) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-brand-navy/45">
        Nothing on your watchlist yet.{" "}
        <Link href="/app/watchlist" className="font-semibold text-brand-primary hover:underline">
          Add instruments →
        </Link>
      </p>
    );
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
