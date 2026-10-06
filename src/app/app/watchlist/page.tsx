import type { Prisma } from "@prisma/client";
import Pager from "@/components/ui/pager";
import ListToolbar from "@/components/ui/list-toolbar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { keepParams, qEnum, qText } from "@/lib/list-query";
import MarketRefresh from "@/components/markets/auto-refresh";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import WatchlistManager from "@/components/watchlist-manager";
import { Star } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Watchlist", robots: { index: false } };

const SORTS = ["new", "old", "symbol"] as const;
const ORDER: Record<(typeof SORTS)[number], Prisma.WatchlistItemOrderByWithRelationInput> = { new: { createdAt: "desc" }, old: { createdAt: "asc" }, symbol: { instrument: { symbol: "asc" } } };

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const market = marketDataFor(session?.user?.id, "view");
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const sp = await searchParams;
  const q = qText(sp.q);
  const sort = qEnum(sp.sort, SORTS, "new");
  const where: Prisma.WatchlistItemWhereInput = { userId, ...(q ? { instrument: { OR: [{ symbol: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}) };
  const [watched, matching] = await Promise.all([prisma.watchlistItem.findMany({ where: { userId }, select: { instrument: { select: { symbol: true } } } }), prisma.watchlistItem.count({ where })]);
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(matching, page, size);
  const params = keepParams({ q, sort: sort === "new" ? undefined : sort, size: size === 25 ? undefined : String(size) });

  // Only the page shown is loaded and priced — a long watchlist doesn't fetch every quote on each refresh.
  const [watchlistItems, allInstruments] = await Promise.all([
    prisma.watchlistItem.findMany({
      where,
      include: { instrument: true },
      orderBy: ORDER[sort],
      skip: win.skip,
      take: win.take,
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
      <MarketRefresh seconds={10} />
      <PageHeader title="Watchlist" icon={Star} description={<>Track instruments you&rsquo;re watching. Prices update by themselves every few seconds while the market is open, and show the last close after it.</>} />
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
          watched={watched.map((w) => w.instrument.symbol)}
          total={watched.length}
          toolbar={
            <ListToolbar
              params={params}
              search={{ placeholder: "Search your watchlist…" }}
              selects={[{ name: "sort", label: "Sort", options: [{ value: "new", label: "Recently added" }, { value: "old", label: "Oldest first" }, { value: "symbol", label: "Symbol A–Z" }] }]}
            />
          }
          pager={<Pager basePath="/app/watchlist" params={params} window={win} />}
        />
      </div>
    </div>
  );
}
