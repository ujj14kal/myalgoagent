"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ChainRow } from "@/lib/market-data";
import type { OptionLeg } from "@/lib/options/positions";
import { inMarketWindow } from "@/lib/paper/market-window";

// The live option chain (licensed feed): OI, change in OI, IV, delta and
// prices per strike, with Buy/Sell buttons that add a leg to the Options Lab.

export type ChainContext = {
  underlying: string;
  expiry: string;
  spot: number;
  step: number;
  daysToExpiry: number;
  lotSize: number;
  atmIv: number | null;
  rows: ChainRow[];
};

type ChainResponse = {
  live: boolean;
  error?: string;
  underlying: string;
  expiries: string[];
  expiry: string;
  daysToExpiry: number;
  lotSize: number | null;
  spot: number | null;
  pcr: number | null;
  maxPain: number | null;
  rows: ChainRow[];
};

const UNDERLYINGS = ["NIFTY", "BANKNIFTY"];
const fmt = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const lakh = (n: number | null) => (n == null ? "—" : n >= 1e5 ? `${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L` : n.toLocaleString("en-IN"));
const pctOi = (oi: number | null, prev: number | null) => (oi == null || !prev ? null : ((oi - prev) / prev) * 100);
const expiryLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** The strike spacing (most common gap between listed strikes). */
function strikeStep(rows: ChainRow[]): number {
  const gaps = new Map<number, number>();
  for (let i = 1; i < rows.length; i++) {
    const g = Math.round((rows[i].strike - rows[i - 1].strike) * 100) / 100;
    gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  return [...gaps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 50;
}

export default function OptionChain({ onAdd, onContext }: { onAdd: (leg: OptionLeg) => void; onContext: (ctx: ChainContext) => void }) {
  const [underlying, setUnderlying] = useState("NIFTY");
  const [custom, setCustom] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [data, setData] = useState<ChainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [window_, setWindow] = useState<number>(12); // strikes shown each side of the money; 0 = all
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    const q = new URLSearchParams({ underlying, ...(expiry ? { expiry } : {}) });
    fetch(`/api/options/chain?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ChainResponse) => {
        if (cancelled) return;
        if (d.error) return setError(d.error);
        setError(null);
        setData(d);
      })
      .catch(() => !cancelled && setError("Couldn't load the option chain."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [underlying, expiry, tick]);

  // Live refresh every 5 s while the market is open.
  useEffect(() => {
    const t = setInterval(() => !document.hidden && inMarketWindow(new Date()) && setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const step = useMemo(() => (data ? strikeStep(data.rows) : 50), [data]);
  const spot = data?.spot ?? null;
  const atm = spot != null && data ? data.rows.reduce((b, r) => (Math.abs(r.strike - spot) < Math.abs(b - spot) ? r.strike : b), data.rows[0]?.strike ?? 0) : null;
  const atmRow = data?.rows.find((r) => r.strike === atm);
  const atmIv = atmRow ? ((atmRow.call.iv || 0) + (atmRow.put.iv || 0)) / ((atmRow.call.iv ? 1 : 0) + (atmRow.put.iv ? 1 : 0) || 1) || null : null;

  useEffect(() => {
    if (data && spot != null) {
      onContext({ underlying: data.underlying, expiry: data.expiry, spot, step, daysToExpiry: data.daysToExpiry, lotSize: data.lotSize ?? 1, atmIv, rows: data.rows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the chain itself changes
  }, [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    if (window_ === 0 || atm == null) return data.rows;
    const i = data.rows.findIndex((r) => r.strike === atm);
    return data.rows.slice(Math.max(0, i - window_), i + window_ + 1);
  }, [data, window_, atm]);
  const maxOi = Math.max(1, ...shown.flatMap((r) => [r.call.oi ?? 0, r.put.oi ?? 0]));

  const add = (row: ChainRow, type: "CE" | "PE", side: "BUY" | "SELL") => {
    const q = type === "CE" ? row.call : row.put;
    const premium = (side === "BUY" ? q.ask : q.bid) ?? q.ltp;
    if (!premium || !data) return;
    onAdd({ kind: "OPTION", type, side, strike: row.strike, premium, premiumSource: "market", ivSource: q.iv ? "market" : "assumed", lots: 1, lotSize: data.lotSize ?? 1, expiryDays: Math.max(data.daysToExpiry, 0.01), iv: q.iv || atmIv || 0.15 });
  };

  const btn = "rounded px-1.5 py-0.5 text-[10px] font-bold";
  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] p-3">
        {UNDERLYINGS.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => {
              setUnderlying(u);
              setExpiry(null);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${underlying === u ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/65"}`}
          >
            {u}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) {
              setUnderlying(custom.trim().toUpperCase());
              setExpiry(null);
            }
          }}
          className="flex items-center gap-1"
        >
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Stock, e.g. RELIANCE" className="w-40 rounded-full border border-brand-navy/15 px-3 py-1 text-xs outline-none focus:border-brand-primary" />
        </form>
        {data && (
          <select value={data.expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-full border border-brand-navy/15 px-3 py-1 text-xs">
            {data.expiries.map((d) => (
              <option key={d} value={d}>
                {expiryLabel(d)}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setTick((n) => n + 1)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-primary" aria-label="Refresh">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Live
        </button>
      </div>

      {error && <p className="px-4 py-6 text-center text-sm text-brand-sell">{error}</p>}
      {data && !error && (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-black/[0.05] px-4 py-3 text-xs sm:grid-cols-6">
            {[
              ["Spot", fmt(spot)],
              ["Days left", fmt(data.daysToExpiry, 1)],
              ["Lot size", data.lotSize ? String(data.lotSize) : "—"],
              ["ATM IV", atmIv ? `${fmt(atmIv * 100, 1)}%` : "—"],
              ["PCR (OI)", fmt(data.pcr)],
              ["Max pain", fmt(data.maxPain, 0)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="font-semibold uppercase tracking-wide text-brand-navy/45">{k}</p>
                <p className="text-sm font-bold tabular-nums text-brand-navy">{v}</p>
              </div>
            ))}
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[860px] text-xs tabular-nums">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-[10px] uppercase tracking-wide text-brand-navy/45">
                  <th className="px-2 py-2 text-left" colSpan={6}>
                    Calls
                  </th>
                  <th className="px-2 py-2">Strike</th>
                  <th className="px-2 py-2 text-right" colSpan={6}>
                    Puts
                  </th>
                </tr>
                <tr className="border-b border-black/[0.06] text-[10px] text-brand-navy/45">
                  {["OI", "ΔOI", "IV", "Δ", "LTP", ""].map((h, i) => (
                    <th key={`c${i}`} className="px-2 pb-1.5 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                  <th />
                  {["", "LTP", "Δ", "IV", "ΔOI", "OI"].map((h, i) => (
                    <th key={`p${i}`} className="px-2 pb-1.5 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const callItm = spot != null && r.strike < spot;
                  const putItm = spot != null && r.strike > spot;
                  const cOi = pctOi(r.call.oi, r.call.prevOi);
                  const pOi = pctOi(r.put.oi, r.put.prevOi);
                  return (
                    <tr key={r.strike} className={`border-b border-black/[0.03] ${r.strike === atm ? "outline outline-1 outline-brand-primary/40" : ""}`}>
                      <td className={`relative px-2 py-1 text-right ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>
                        <span className="absolute inset-y-1 right-0 bg-brand-sell/10" style={{ width: `${((r.call.oi ?? 0) / maxOi) * 100}%` }} />
                        <span className="relative">{lakh(r.call.oi)}</span>
                      </td>
                      <td className={`px-2 py-1 text-right ${cOi == null ? "text-brand-navy/30" : cOi >= 0 ? "text-[#0b6b30]" : "text-[#9b1111]"} ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>{cOi == null ? "—" : `${fmt(cOi, 0)}%`}</td>
                      <td className={`px-2 py-1 text-right ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>{r.call.iv ? fmt(r.call.iv * 100, 1) : "—"}</td>
                      <td className={`px-2 py-1 text-right text-brand-navy/60 ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>{r.call.delta == null ? "—" : fmt(r.call.delta)}</td>
                      <td className={`px-2 py-1 text-right font-semibold text-brand-navy ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>{fmt(r.call.ltp)}</td>
                      <td className={`whitespace-nowrap px-1 py-1 text-right ${callItm ? "bg-brand-gold/[0.07]" : ""}`}>
                        <button type="button" disabled={!r.call.ltp} onClick={() => add(r, "CE", "BUY")} className={`${btn} bg-brand-buy/10 text-[#0b6b30] disabled:opacity-30`}>
                          B
                        </button>{" "}
                        <button type="button" disabled={!r.call.ltp} onClick={() => add(r, "CE", "SELL")} className={`${btn} bg-brand-sell/10 text-[#9b1111] disabled:opacity-30`}>
                          S
                        </button>
                      </td>
                      <td className={`px-3 py-1 text-center font-bold ${r.strike === atm ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-navy"}`}>{fmt(r.strike, r.strike % 1 ? 1 : 0)}</td>
                      <td className={`whitespace-nowrap px-1 py-1 ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>
                        <button type="button" disabled={!r.put.ltp} onClick={() => add(r, "PE", "BUY")} className={`${btn} bg-brand-buy/10 text-[#0b6b30] disabled:opacity-30`}>
                          B
                        </button>{" "}
                        <button type="button" disabled={!r.put.ltp} onClick={() => add(r, "PE", "SELL")} className={`${btn} bg-brand-sell/10 text-[#9b1111] disabled:opacity-30`}>
                          S
                        </button>
                      </td>
                      <td className={`px-2 py-1 text-right font-semibold text-brand-navy ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>{fmt(r.put.ltp)}</td>
                      <td className={`px-2 py-1 text-right text-brand-navy/60 ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>{r.put.delta == null ? "—" : fmt(r.put.delta)}</td>
                      <td className={`px-2 py-1 text-right ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>{r.put.iv ? fmt(r.put.iv * 100, 1) : "—"}</td>
                      <td className={`px-2 py-1 text-right ${pOi == null ? "text-brand-navy/30" : pOi >= 0 ? "text-[#0b6b30]" : "text-[#9b1111]"} ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>{pOi == null ? "—" : `${fmt(pOi, 0)}%`}</td>
                      <td className={`relative px-2 py-1 text-right ${putItm ? "bg-brand-gold/[0.07]" : ""}`}>
                        <span className="absolute inset-y-1 left-0 bg-brand-buy/10" style={{ width: `${((r.put.oi ?? 0) / maxOi) * 100}%` }} />
                        <span className="relative">{lakh(r.put.oi)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-brand-navy/45">
            <span>Shaded = in the money · B/S adds a leg below at the ask/bid · <strong className="font-semibold">Source: market data feed</strong> (OI, IV, delta and prices are the feed&apos;s own, not calculated by us) · refreshes every 5 s in market hours</span>
            <label className="flex items-center gap-1.5 font-semibold text-brand-primary">
              Strikes shown
              <select value={window_} onChange={(e) => setWindow(Number(e.target.value))} className="rounded border border-brand-navy/15 bg-white px-1.5 py-0.5 text-[11px] text-brand-navy">
                <option value={6}>±6 from the money</option>
                <option value={12}>±12 from the money</option>
                <option value={25}>±25 from the money</option>
                <option value={0}>All {data.rows.length}</option>
              </select>
              <span className="font-normal text-brand-navy/45">({shown.length} listed)</span>
            </label>
          </div>
        </>
      )}
      {!data && !error && <p className="px-4 py-10 text-center text-sm text-brand-navy/45">Loading the option chain…</p>}
    </section>
  );
}
