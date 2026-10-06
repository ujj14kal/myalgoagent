import Pager from "@/components/ui/pager";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qText } from "@/lib/list-query";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import InstrumentSearch from "@/components/instrument-search";
import MarketOverview, { type HeatTile, type IndexQuote } from "@/components/markets/market-overview";
import { CandlestickChart } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { marketDataFor, marketExtrasFor, type MarketDataProvider } from "@/lib/market-data";
import { logError } from "@/lib/logger";

export const metadata = { title: "Market Data", robots: { index: false } };
export const dynamic = "force-dynamic";

const INDICES = [
  { symbol: "^NSEI", name: "NIFTY 50" },
  { symbol: "^NSEBANK", name: "NIFTY BANK" },
  { symbol: "^CNXIT", name: "NIFTY IT" },
  { symbol: "^BSESN", name: "SENSEX" },
];

/** Last price (live trade when there is one) and change against the previous session's close. */
async function indexQuote(market: MarketDataProvider, symbol: string, name: string): Promise<IndexQuote | null> {
  const [daily, ticks] = await Promise.all([market.getHistoricalCandles(symbol, "5d", "1d"), market.getRecentTicks?.(symbol, 1).catch(() => []) ?? []]);
  const todayIst = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const dayOf = (t: number) => new Date(t * 1000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const tick = ticks.at(-1);
  const last = tick?.price ?? daily.at(-1)?.close;
  if (!last) return null;
  // The previous close is the last daily candle before the day of the price we're showing.
  const priceDay = tick ? dayOf(tick.time) : daily.at(-1) ? dayOf(daily.at(-1)!.time) : todayIst;
  const prev = [...daily].reverse().find((c) => dayOf(c.time) < priceDay)?.close;
  return { symbol, name, last, changePct: prev ? ((last - prev) / prev) * 100 : null };
}

export default async function InstrumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const q = qText(sp.q, 40);
  const sector = qText(sp.sector, 60) ?? null;
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const extras = marketExtrasFor(session?.user?.id);
  const market = marketDataFor(session?.user?.id, "view");

  // Search and the sector filter run in the database; ranking and paging here; one page is sent.
  const [matches, total, sectorCounts, overview] = await Promise.all([
    prisma.instrument.findMany({ where: { ...(sector ? { sector } : {}), ...(like ? { OR: [{ symbol: like }, { name: like }] } : {}) }, orderBy: { symbol: "asc" }, select: { symbol: true, name: true, exchange: true, sector: true } }),
    prisma.instrument.count(),
    prisma.instrument.groupBy({ by: ["sector"], where: { sector: { not: null } }, _count: true }),
    extras
      ? (async () => {
          const settle = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch((err) => (logError("markets.overview", err), fallback));
          const [indices, b50, bAll, gainers, losers, volume, turnover, members, changes] = await Promise.all([
            Promise.all(INDICES.map((i) => settle(indexQuote(market, i.symbol, i.name), null))),
            settle(extras.breadth("NIFTY 50"), null),
            settle(extras.breadth("NIFTY TOTAL MARKET"), null),
            settle(extras.movers("gainers", 8), []),
            settle(extras.movers("losers", 8), []),
            settle(extras.movers("volume", 8), []),
            settle(extras.mostActive("turnover", 8), []),
            settle(extras.indexMembers("NIFTY 50"), []),
            settle(extras.dayChanges(), new Map()),
          ]);
          const heatmap: HeatTile[] = members.flatMap((m) => {
            const c = changes.get(m.symbol);
            return c ? [{ symbol: m.symbol, industry: m.industry, changePct: c.changePct, close: c.close }] : [];
          });
          const breadth = [
            ...(b50 ? [{ label: "NIFTY 50", b: b50 }] : []),
            ...(bAll ? [{ label: "NIFTY Total Market", b: bAll }] : []),
          ];
          return { indices: indices.filter((q): q is IndexQuote => !!q), breadth, gainers, losers, volume, turnover, heatmap };
        })()
      : null,
  ]);
  const ql = q?.toLowerCase();
  // Indices and exact/prefix matches first, then the large caps that carry a sector.
  const ranked = matches
    .map((i) => {
      const plain = i.symbol.replace(/\.NS$|\.BO$|^\^/, "").toLowerCase();
      const rank = ql ? (plain === ql ? 0 : plain.startsWith(ql) ? 1 : i.name.toLowerCase().startsWith(ql) ? 2 : 3) : i.symbol.startsWith("^") ? 0 : i.sector ? 1 : 2;
      return { i, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.i.symbol.localeCompare(b.i.symbol))
    .map((m) => m.i);
  const { page, size } = readPageQuery(sp, 25);
  const shown = pageRows(ranked, page, size);
  const params = keepParams({ q, sector: sector ?? undefined, size: size === 25 ? undefined : String(size) });
  const sectors = sectorCounts.flatMap((c) => (c.sector ? [{ sector: c.sector, count: c._count }] : [])).sort((a, b) => b.count - a.count);
  const asOf = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <PageHeader
        title="Market Data"
        icon={CandlestickChart}
        description={<>{total.toLocaleString("en-IN")} instruments — every NSE-listed stock plus the main indices. Search by symbol or company name.</>}
      />
      {overview && (
        <div className="mt-6">
          <MarketOverview {...overview} asOf={asOf} />
        </div>
      )}
      <div className="mt-6">
        <InstrumentSearch instruments={shown.rows} total={total} sectors={sectors} sector={sector} query={q ?? null} params={params} pager={<Pager basePath="/app/instruments" params={params} window={shown.win} />} />
      </div>
    </div>
  );
}
