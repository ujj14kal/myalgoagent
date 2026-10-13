import { Gauge } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import SymbolSwitcher from "@/components/symbol-switcher";

export const metadata = { title: "Analyst Pro", robots: { index: false } };

const START = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS"];

export default async function AnalystPage() {
  const instruments = await prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } });
  return (
    <div>
      <PageHeader
        title="Analyst Pro"
        icon={Gauge}
        description="Pick a stock and see what its chart says, indicator by indicator: trend, momentum, volume and volatility, with the reading and the weight of each one, plus the nearest support and resistance. Everything comes from price and volume only. It describes the chart today; it is not a forecast or advice."
      />
      <div className="flex flex-wrap items-center gap-3">
        <SymbolSwitcher currentSymbol="Choose a stock" allInstruments={instruments} basePath="/app/analyst" />
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-brand-navy/50">Quick start</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {START.filter((s) => instruments.some((i) => i.symbol === s)).map((s) => (
          <a key={s} href={`/app/analyst/${encodeURIComponent(s)}`} className="rounded-full border border-brand-navy/10 bg-white px-3.5 py-1.5 text-sm font-medium text-brand-navy hover:border-brand-primary/40 hover:text-brand-primary">
            {s.replace(/\.(NS|BO)$/, "")}
          </a>
        ))}
      </div>
    </div>
  );
}
