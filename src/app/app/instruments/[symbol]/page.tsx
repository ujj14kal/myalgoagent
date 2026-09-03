import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import { sma, ema, rsi } from "@/lib/indicators";
import InstrumentChartPanel from "@/components/instrument-chart-panel";

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

  const instrument = await prisma.instrument.findUnique({ where: { symbol } });
  if (!instrument) {
    notFound();
  }

  let candles: Awaited<ReturnType<typeof marketDataProvider.getHistoricalCandles>> = [];
  let fetchError: string | null = null;
  try {
    candles = await marketDataProvider.getHistoricalCandles(symbol, "6mo", "1d");
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load market data";
  }

  const latest = candles.at(-1);

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
            candles={candles}
            sma20={sma(candles, 20)}
            ema50={ema(candles, 50)}
            rsi14={rsi(candles, 14)}
          />
        )}
      </div>
    </div>
  );
}
