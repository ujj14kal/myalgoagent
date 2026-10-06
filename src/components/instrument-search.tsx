import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";

// The instrument browser: search and sector filter run on the server (instruments/page.tsx), and
// only the page shown comes to the browser — not all 2,700+ instruments.

interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InstrumentSearch({
  instruments,
  total,
  sectors,
  sector,
  query,
  params,
  pager,
}: {
  /** The page shown. */
  instruments: Instrument[];
  /** Every instrument (for the "All" count). */
  total: number;
  sectors: { sector: string; count: number }[];
  sector: string | null;
  query: string | null;
  params: Record<string, string | undefined>;
  pager: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <ListToolbar basePath="/app/instruments" params={params} search={{ placeholder: "Search by symbol or company name…" }} />
      {sectors.length > 1 && (
        <ListTabs
          basePath="/app/instruments"
          params={params}
          name="sector"
          tabs={[{ value: "", label: "All", count: total }, ...sectors.map((s) => ({ value: s.sector, label: titleCase(s.sector), count: s.count }))]}
          active={sector ?? ""}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {instruments.map((i) => (
          <Link key={i.symbol} href={`/app/instruments/${encodeURIComponent(i.symbol)}`} className="surface surface-interactive group flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/[0.07] text-xs font-bold tracking-tight text-brand-primary">
              {i.symbol.replace(/\.NS$|\.BO$/, "").slice(0, 3)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{i.symbol}</span>
              <span className="block truncate text-xs text-brand-navy/55">{i.name}</span>
              {i.sector && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-navy/35">{i.sector}</span>}
            </span>
            <ChevronRight size={16} className="shrink-0 text-brand-navy/20 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
          </Link>
        ))}
        {instruments.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-brand-navy/15 py-10 text-center text-sm text-brand-navy/50">
            No instruments match{query ? <> &ldquo;{query}&rdquo;</> : null}
            {sector ? <> in {titleCase(sector)}</> : null}.
          </p>
        )}
      </div>
      {pager}
    </div>
  );
}
