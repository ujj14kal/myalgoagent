import { prisma } from "@/lib/prisma";
import InstrumentSearch from "@/components/instrument-search";

export const metadata = { title: "Market Data", robots: { index: false } };

export default async function InstrumentsPage() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { symbol: "asc" },
    select: { symbol: true, name: true, exchange: true, sector: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Market Data</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        {instruments.length} NSE instruments. Search by symbol or company name.
      </p>
      <div className="mt-6">
        <InstrumentSearch instruments={instruments} />
      </div>
    </div>
  );
}
