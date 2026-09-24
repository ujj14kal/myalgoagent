import { prisma } from "@/lib/prisma";
import InstrumentSearch from "@/components/instrument-search";
import { CandlestickChart } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Market Data", robots: { index: false } };

export default async function InstrumentsPage() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { symbol: "asc" },
    select: { symbol: true, name: true, exchange: true, sector: true },
  });

  return (
    <div>
      <PageHeader title="Market Data" icon={CandlestickChart} description={<>{instruments.length} NSE instruments. Search by symbol or company name.</>} />
      <div className="mt-6">
        <InstrumentSearch instruments={instruments} />
      </div>
    </div>
  );
}
