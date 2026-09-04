import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import InstrumentChartPanel from "@/components/instrument-chart-panel";
import type { ChartType } from "@/components/candlestick-chart";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import type { CandleInterval } from "@/lib/market-data";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol), robots: { index: false } };
}

export default async function InstrumentDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol);

  const session = await auth();
  const instrument = await prisma.instrument.findUnique({ where: { symbol } });
  if (!instrument) {
    notFound();
  }

  const [allInstruments, savedLayout] = await Promise.all([
    prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } }),
    session?.user?.id
      ? prisma.chartLayout.findUnique({
          where: { userId_instrumentId: { userId: session.user.id, instrumentId: instrument.id } },
        })
      : null,
  ]);

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  try {
    candles = await marketDataProvider.getHistoricalCandles(symbol, "6mo", "1d");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load market data";
  }

  const latest = candles.at(-1);
  const savedConfig = savedLayout
    ? (savedLayout.config as unknown as {
        chartType: ChartType;
        interval: CandleInterval;
        overlays: string[];
        oscillators: string[];
        showVolume: boolean;
        drawings: Drawing[];
        compareSymbol: string | null;
      })
    : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{instrument.symbol}</h1>
          <p className="mt-1 text-sm text-brand-navy/60">{instrument.name}</p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-navy">
              ₹{latest.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-brand-navy/50">Last close</p>
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-brand-navy/40">
        Data: {marketDataProvider.name}
        {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"}
        {" · "}Daily bars, not real-time
      </p>

      <div className="mt-6">
        {fetchError ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : candles.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="py-16 text-center text-sm text-brand-navy/50">No data available.</p>
          </div>
        ) : (
          <InstrumentChartPanel
            instrumentId={instrument.id}
            symbol={instrument.symbol}
            candles={candles}
            allInstruments={allInstruments}
            savedLayout={savedConfig}
          />
        )}
      </div>
    </div>
  );
}
