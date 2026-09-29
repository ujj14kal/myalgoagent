import { CalendarClock, Gauge } from "lucide-react";
import type { CorpAction } from "@/lib/market-data";
import { formatPrice } from "@/lib/format";

export type KeyStats = {
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  turnover: number | null;
  week52: { high: number; low: number } | null;
  last: number | null;
};

const compact = (n: number | null) =>
  n == null ? "—" : n >= 1e7 ? `${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr` : n >= 1e5 ? `${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L` : n.toLocaleString("en-IN");
const price = (n: number | null) => (n == null ? "—" : `₹${formatPrice(n)}`);
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function Range({ low, high, at, label }: { low: number; high: number; at: number | null; label: string }) {
  const pos = at == null || high <= low ? null : Math.min(Math.max((at - low) / (high - low), 0), 1) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-brand-navy/50">
        <span>{label}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-brand-sell/40 via-brand-gold/40 to-brand-buy/40">
        {pos != null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-navy shadow" style={{ left: `${pos}%` }} />}
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-brand-navy/70">
        <span>{price(low)}</span>
        <span>{price(high)}</span>
      </div>
    </div>
  );
}

/** Day stats, 52-week range and corporate actions — shown to accounts on the licensed feed. */
export default function InstrumentExtras({ stats, actions }: { stats: KeyStats; actions: CorpAction[] }) {
  const cells: [string, string][] = [
    ["Open", price(stats.open)],
    ["Prev. close", price(stats.prevClose)],
    ["Volume", compact(stats.volume)],
    ["Value traded", stats.turnover == null ? "—" : `₹${compact(stats.turnover)}`],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="surface p-4 lg:col-span-2">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <Gauge size={15} className="text-brand-primary" /> Key stats
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cells.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-brand-bg/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">{k}</p>
              <p className="text-sm font-semibold tabular-nums text-brand-navy">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {stats.low != null && stats.high != null && <Range label="Today's range" low={stats.low} high={stats.high} at={stats.last} />}
          {stats.week52 && <Range label="52-week range" low={stats.week52.low} high={stats.week52.high} at={stats.last} />}
        </div>
      </section>
      <section className="surface p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <CalendarClock size={15} className="text-brand-primary" /> Corporate actions
        </p>
        {actions.length === 0 ? (
          <p className="py-4 text-center text-xs text-brand-navy/45">None on record.</p>
        ) : (
          <ul className="space-y-2">
            {actions.slice(0, 8).map((a) => (
              <li key={`${a.purpose}-${a.exDate}`} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-brand-navy/80">{a.purpose}</span>
                <span className="shrink-0 text-xs text-brand-navy/50">ex {day(a.exDate)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-brand-navy/40">Past prices on the chart are adjusted for splits and bonuses.</p>
      </section>
    </div>
  );
}
