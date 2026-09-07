import Link from "next/link";

export default function WatchlistSnippet({
  items,
}: {
  items: { symbol: string; name: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="py-4 text-sm text-brand-navy/40">
        Nothing on your watchlist yet.{" "}
        <Link href="/app/watchlist" className="text-brand-primary hover:underline">
          Add instruments →
        </Link>
      </p>
    );
  }

  return (
    <ul className="divide-y divide-black/5">
      {items.map((w) => (
        <li key={w.symbol}>
          <Link
            href={`/app/instruments/${w.symbol}`}
            className="flex items-center justify-between py-2 text-sm hover:text-brand-primary"
          >
            <span className="font-medium text-brand-navy">{w.symbol}</span>
            <span className="truncate text-brand-navy/50">{w.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
