import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import InstrumentChartPanel from "@/components/instrument-chart-panel";
import SymbolSwitcher from "@/components/symbol-switcher";
import type { ChartType } from "@/components/candlestick-chart";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import type { CandleInterval } from "@/lib/market-data";
import { normalizeIndicatorInstances } from "@/lib/chart-indicator-instance";
import { formatPct, formatPrice, formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

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
  const prev = candles.at(-2);
  const dayChange = latest && prev ? latest.close - prev.close : null;
  const dayChangePct = dayChange !== null && prev ? (dayChange / prev.close) * 100 : null;
  const rawConfig = savedLayout
    ? (savedLayout.config as unknown as {
        chartType: ChartType;
        interval: CandleInterval;
        overlays: unknown;
        oscillators: unknown;
        showVolume: boolean;
        drawings: Drawing[];
        compareSymbol: string | null;
        showVisibleRangeVolumeProfile?: boolean;
      })
    : null;
  // `overlays`/`oscillators` may still be the old bare-string-key format
  // from a layout saved before the full indicator catalog was wired up —
  // normalize either shape to the current ActiveIndicatorInstance[] form.
  const savedConfig = rawConfig
    ? {
        ...rawConfig,
        overlays: normalizeIndicatorInstances(rawConfig.overlays),
        oscillators: normalizeIndicatorInstances(rawConfig.oscillators),
      }
    : null;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-xs font-bold text-white sm:flex">
            {instrument.symbol.replace(/\.NS$|\.BO$/, "").slice(0, 3)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-brand-navy">{instrument.symbol}</h1>
              <SymbolSwitcher currentSymbol={instrument.symbol} allInstruments={allInstruments} />
            </div>
            <p className="mt-0.5 text-sm text-brand-navy/60">{instrument.name}</p>
          </div>
        </div>
        {latest && (
          <div className="sm:text-right">
            <p className="num text-2xl font-bold tracking-tight text-brand-navy">₹{formatPrice(latest.close)}</p>
            <p className="text-xs text-brand-navy/50">
              {dayChange !== null && dayChangePct !== null && (
                <span className={`num mr-1.5 font-semibold ${TONE_TEXT[toneOf(dayChange)]}`}>
                  {formatSignedINR(dayChange, 2)} ({formatPct(dayChangePct)})
                </span>
              )}
              Last close
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-brand-navy/45">
        Data: {marketDataProvider.name}
        {!marketDataProvider.isOfficial && " (interim feed, not an official NSE/BSE source)"}
        {" · "}Delayed, not real-time · bar size set by the interval selected below
      </p>

      <div className="mt-6">
        {fetchError ? (
          <div className="surface p-4">
            <p className="py-16 text-center text-sm text-brand-sell">{fetchError}</p>
          </div>
        ) : candles.length === 0 ? (
          <div className="surface p-4">
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
