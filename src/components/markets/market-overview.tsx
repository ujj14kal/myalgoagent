import Link from "next/link";
import { Activity, BarChart3, Flame, LayoutGrid, TrendingDown, TrendingUp } from "lucide-react";
import type { Active, Breadth, Mover } from "@/lib/market-data";
import { formatPct, formatPrice, toneOf, TONE_TEXT } from "@/lib/format";
import AutoRefresh from "./auto-refresh";

export type IndexQuote = { symbol: string; name: string; last: number; changePct: number | null };
export type HeatTile = { symbol: string; industry: string; changePct: number; close: number };

const plain = (s: string) => s.replace(/\.NS$/, "");
const href = (s: string) => `/app/instruments/${encodeURIComponent(s)}`;
const compact = (n: number | null) =>
  n == null ? "—" : n >= 1e7 ? `${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr` : n >= 1e5 ? `${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L` : n.toLocaleString("en-IN");

function heatColor(pct: number) {
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.85 + 0.1;
  return pct >= 0 ? `rgba(0,168,62,${a})` : `rgba(214,0,0,${a})`;
}

function BreadthBar({ label, b }: { label: string; b: Breadth }) {
  const adv = (b.advances / Math.max(b.total, 1)) * 100;
  const dec = (b.declines / Math.max(b.total, 1)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold text-brand-navy">{label}</span>
        <span className="text-brand-navy/55">
          <span className="text-[#0b6b30]">{b.advances} up</span> · <span className="text-[#9b1111]">{b.declines} down</span>
          {b.total - b.advances - b.declines > 0 && ` · ${b.total - b.advances - b.declines} flat`}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.06]">
        <div className="bg-brand-buy" style={{ width: `${adv}%` }} />
        <div className="ml-auto bg-brand-sell" style={{ width: `${dec}%` }} />
      </div>
    </div>
  );
}

function MoverTable({ title, icon: Icon, rows, value }: { title: string; icon: typeof Flame; rows: (Mover | Active)[]; value: (r: Mover | Active) => string }) {
  return (
    <section className="surface overflow-hidden">
      <p className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">
        <Icon size={15} className="text-brand-primary" /> {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-brand-navy/45">No data right now.</p>
      ) : (
        <ul className="divide-y divide-black/[0.04]">
          {rows.map((r) => {
            const pct = "changePct" in r ? r.changePct : null;
            const price = "close" in r ? r.close : r.ltp;
            return (
              <li key={r.symbol}>
                <Link href={href(r.symbol)} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-brand-bg/60">
                  <span className="min-w-0 flex-1 truncate font-semibold text-brand-navy">{plain(r.symbol)}</span>
                  <span className="text-xs text-brand-navy/45">{value(r)}</span>
                  <span className="w-20 text-right tabular-nums text-brand-navy/80">{formatPrice(price)}</span>
                  <span className={`w-16 text-right text-xs font-semibold tabular-nums ${pct == null ? "text-brand-navy/40" : TONE_TEXT[toneOf(pct)]}`}>{pct == null ? "—" : formatPct(pct)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Live market snapshot for accounts on the licensed feed — refreshes itself every 30 s in market hours. */
export default function MarketOverview({
  indices,
  breadth,
  gainers,
  losers,
  volume,
  turnover,
  heatmap,
  asOf,
}: {
  indices: IndexQuote[];
  breadth: { label: string; b: Breadth }[];
  gainers: Mover[];
  losers: Mover[];
  volume: Mover[];
  turnover: Active[];
  heatmap: HeatTile[];
  asOf: string;
}) {
  const byIndustry = new Map<string, HeatTile[]>();
  for (const t of heatmap) byIndustry.set(t.industry, [...(byIndustry.get(t.industry) ?? []), t]);
  return (
    <div className="space-y-5">
      <AutoRefresh seconds={30} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indices.map((q) => (
          <Link key={q.symbol} href={href(q.symbol)} className="surface surface-interactive p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/45">{q.name}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-brand-navy">{formatPrice(q.last)}</p>
            <p className={`text-sm font-semibold tabular-nums ${q.changePct == null ? "text-brand-navy/40" : TONE_TEXT[toneOf(q.changePct)]}`}>{q.changePct == null ? "—" : formatPct(q.changePct)}</p>
          </Link>
        ))}
      </div>

      {breadth.length > 0 && (
        <section className="surface space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <BarChart3 size={15} className="text-brand-primary" /> Market breadth
          </p>
          {breadth.map((x) => (
            <BreadthBar key={x.label} label={x.label} b={x.b} />
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MoverTable title="Top gainers" icon={TrendingUp} rows={gainers} value={(r) => compact(r.volume)} />
        <MoverTable title="Top losers" icon={TrendingDown} rows={losers} value={(r) => compact(r.volume)} />
        <MoverTable title="Volume leaders" icon={Flame} rows={volume} value={(r) => compact(r.volume)} />
        <MoverTable title="Most traded (₹)" icon={Activity} rows={turnover} value={(r) => `₹${compact(r.turnover)}`} />
      </div>

      {heatmap.length > 0 && (
        <section className="surface p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <LayoutGrid size={15} className="text-brand-primary" /> NIFTY 50 heatmap
          </p>
          <div className="space-y-2">
            {[...byIndustry.entries()].sort((a, b) => b[1].length - a[1].length).map(([industry, tiles]) => (
              <div key={industry} className="flex flex-wrap items-stretch gap-1">
                <span className="w-32 shrink-0 self-center truncate text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45" title={industry}>
                  {industry}
                </span>
                {tiles.sort((a, b) => b.changePct - a.changePct).map((t) => (
                  <Link key={t.symbol} href={href(t.symbol)} title={`${plain(t.symbol)} ₹${formatPrice(t.close)}`} className="min-w-[4.75rem] rounded-md px-2 py-1.5 text-center text-white" style={{ background: heatColor(t.changePct) }}>
                    <span className="block text-[11px] font-bold leading-tight">{plain(t.symbol)}</span>
                    <span className="block text-[11px] tabular-nums leading-tight">{formatPct(t.changePct)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="text-right text-[11px] text-brand-navy/40">Live NSE data · {asOf} IST · refreshes every 30 s while the market is open</p>
    </div>
  );
}
