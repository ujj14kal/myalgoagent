import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import WatchlistManager from "@/components/watchlist-manager";
import { Star } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Watchlist", robots: { index: false } };

export default async function WatchlistPage() {
  const session = await auth();
  const market = marketDataFor(session?.user?.id, "view");
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

  // Last close + day change per watched symbol. A failed quote leaves that
  // item price-less rather than failing the whole page.
  const quotes = new Map<string, { close: number; change: number | null }>();
  await Promise.all(
    watchlistItems.map(async (w) => {
      try {
        const candles = await market.getHistoricalCandles(w.instrument.symbol, "5d", "1d");
        const last = candles.at(-1);
        const prev = candles.at(-2);
        if (last) quotes.set(w.instrument.symbol, { close: last.close, change: prev ? ((last.close - prev.close) / prev.close) * 100 : null });
      } catch {
        // leave this symbol without a quote
      }
    }),
  );

  return (
    <div>
      <PageHeader title="Watchlist" icon={Star} description={<>Track instruments you&rsquo;re watching. Prices are the last daily close, refreshed on page load — not real-time.</>} />
      <div>
        <WatchlistManager
          watchlistItems={watchlistItems.map((w) => ({
            id: w.id,
            symbol: w.instrument.symbol,
            name: w.instrument.name,
            close: quotes.get(w.instrument.symbol)?.close ?? null,
            changePct: quotes.get(w.instrument.symbol)?.change ?? null,
          }))}
          allInstruments={allInstruments}
        />
      </div>
    </div>
  );
}
