import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import WatchlistManager from "@/components/watchlist-manager";

export const metadata = { title: "Watchlist", robots: { index: false } };

export default async function WatchlistPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [watchlistItems, allInstruments] = await Promise.all([
    prisma.watchlistItem.findMany({
      where: { userId: session.user.id },
      include: { instrument: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.instrument.findMany({
      orderBy: { symbol: "asc" },
      select: { id: true, symbol: true, name: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Watchlist</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Track instruments you&rsquo;re watching. Prices update on page load
        (not real-time streaming yet).
      </p>
      <div className="mt-6">
        <WatchlistManager
          watchlistItems={watchlistItems.map((w) => ({
            id: w.id,
            symbol: w.instrument.symbol,
            name: w.instrument.name,
          }))}
          allInstruments={allInstruments}
        />
      </div>
    </div>
  );
}
