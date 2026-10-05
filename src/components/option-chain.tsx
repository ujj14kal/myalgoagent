"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { OptionLeg } from "@/lib/options/positions";
import { CHAIN_PAGE_SIZES, FLAG_TEXT } from "@/lib/options/chain";
import { fmt, legFrom, originTitle, priceText, ORIGIN_STYLE, type ChainResponse, type ChainSide, type Figure } from "@/components/options/chain-types";
import { useChain } from "@/components/options/use-chain";

// The option chain: OI, change in OI, IV, delta and prices per strike, from the user's own broker
// (or the licensed feed, or free-trial estimates — always labelled), with Buy/Sell buttons that add a
// leg to the Options Lab and a click on a strike that opens it in the contract picker. Filtered and
// paged on the server.

export type ChainContext = { data: ChainResponse };

const lakh = (n: number | null) => (n == null ? "—" : n >= 1e5 ? `${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L` : n.toLocaleString("en-IN"));
const pctOi = (oi: number | null, prev: number | null) => (oi == null || !prev ? null : ((oi - prev) / prev) * 100);

/** A figure with its origin shown by colour (and in the tooltip). */
function Fig({ f, data, digits = 2, scale = 1 }: { f: Figure; data: ChainResponse; digits?: number; scale?: number }) {
  if (f.value === null) return <span className="text-brand-navy/30">—</span>;
  return (
    <span title={originTitle(f.origin, data.source)} className={f.origin ? ORIGIN_STYLE[f.origin].cls : ""}>
      {fmt(f.value * scale, digits)}
    </span>
  );
}

function Warn({ q }: { q: ChainSide }) {
  if (!q.flags.length) return null;
  return (
    <span title={q.flags.map((f) => FLAG_TEXT[f]).join("\n")} aria-label={q.flags.map((f) => FLAG_TEXT[f]).join(" ")} className="mr-1 inline-flex align-middle text-[#b26b00]">
      <AlertTriangle size={11} />
    </span>
  );
}

export default function OptionChain({
  underlying,
  expiry,
  onExpiry,
  onAdd,
  onContext,
  onPick,
  lots = 1,
}: {
  underlying: string;
  expiry: string | null;
  onExpiry: (e: string) => void;
  onAdd: (leg: OptionLeg) => void;
  onContext: (ctx: ChainContext) => void;
  onPick?: (strike: number) => void;
  lots?: number;
}) {
  const [window_, setWindow] = useState(12); // strikes each side of the money; 0 = all (paged)
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const { data, error, loading, refresh } = useChain({ underlying, expiry, window: window_, page: window_ === 0 ? page : undefined, size: window_ === 0 ? size : undefined });

  useEffect(() => {
    if (data) onContext({ data });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the chain itself changes
  }, [data]);

  const add = (strike: number, type: "CE" | "PE", side: "BUY" | "SELL", q: ChainSide) => {
    const leg = data && legFrom(data, strike, type, side, q, lots);
    if (leg) onAdd(leg);
  };
  const estimate = data?.source.kind === "estimate";
  const maxOi = Math.max(1, ...(data?.rows ?? []).flatMap((r) => [r.call.oi ?? 0, r.put.oi ?? 0]));
  const btn = "rounded px-1.5 py-0.5 text-[10px] font-bold";

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] p-3 text-xs">
        <span className="font-semibold text-brand-navy">Option chain · {underlying}</span>
        {data && (
          <select aria-label="Expiry" value={data.expiry} onChange={(e) => (onExpiry(e.target.value), setPage(1))} className="rounded-full border border-brand-navy/15 px-3 py-1 text-xs">
            {data.expiries.map((d) => (
              <option key={d} value={d}>
                {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={refresh} className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-primary" aria-label="Refresh">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-6 text-center text-sm">
          <p className="text-brand-sell">{error.message}</p>
          {error.issues.map((i) => (
            <p key={i.broker} className="mt-1 text-xs text-brand-navy/55">
              {i.name}: {i.reason}
            </p>
          ))}
        </div>
      )}
      {data && !error && (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-black/[0.05] px-4 py-3 text-xs sm:grid-cols-6">
            {[
              ["Spot", fmt(data.spot)],
              ["Days left", fmt(data.daysToExpiry, 1)],
              ["Lot size", data.lotSize ? String(data.lotSize) : "—"],
              [estimate ? "Assumed IV" : "ATM IV", data.atmIv ? `${fmt(data.atmIv * 100, 1)}%` : `${fmt(data.assumedIv * 100, 1)}%`],
              ["PCR (OI)", fmt(data.pcr)],
              ["Max pain", fmt(data.maxPain, 0)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="font-semibold uppercase tracking-wide text-brand-navy/45">{k}</p>
                <p className="text-sm font-bold tabular-nums text-brand-navy">{v}</p>
              </div>
            ))}
          </div>
          <div className="max-h-[520px] overflow-auto [contain:inline-size]">
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
                  {["OI", "ΔOI", "IV %", "Δ", estimate ? "Est. price" : "LTP", ""].map((h, i) => (
                    <th key={`c${i}`} className="px-2 pb-1.5 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                  <th />
                  {["", estimate ? "Est. price" : "LTP", "Δ", "IV %", "ΔOI", "OI"].map((h, i) => (
                    <th key={`p${i}`} className="px-2 pb-1.5 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const spot = data.spot;
                  const callItm = spot != null && r.strike < spot;
                  const putItm = spot != null && r.strike > spot;
                  const cOi = pctOi(r.call.oi, r.call.prevOi);
                  const pOi = pctOi(r.put.oi, r.put.prevOi);
                  const ci = callItm ? "bg-brand-gold/[0.07]" : "";
                  const pi = putItm ? "bg-brand-gold/[0.07]" : "";
                  const atm = r.strike === data.atmStrike;
                  return (
                    <tr key={r.strike} className={`border-b border-black/[0.03] ${atm ? "outline outline-1 outline-brand-primary/40" : ""}`}>
                      <td className={`relative px-2 py-1 text-right ${ci}`}>
                        <span className="absolute inset-y-1 right-0 bg-brand-sell/10" style={{ width: `${((r.call.oi ?? 0) / maxOi) * 100}%` }} />
                        <span className="relative">{lakh(r.call.oi)}</span>
                      </td>
                      <td className={`px-2 py-1 text-right ${cOi == null ? "text-brand-navy/30" : cOi >= 0 ? "text-[#0b6b30]" : "text-[#9b1111]"} ${ci}`}>{cOi == null ? "—" : `${fmt(cOi, 0)}%`}</td>
                      <td className={`px-2 py-1 text-right ${ci}`}>
                        <Fig f={r.call.greeks.iv} data={data} digits={1} scale={100} />
                      </td>
                      <td className={`px-2 py-1 text-right ${ci}`}>
                        <Fig f={r.call.greeks.delta} data={data} />
                      </td>
                      <td className={`px-2 py-1 text-right font-semibold text-brand-navy ${ci}`}>
                        <Warn q={r.call} />
                        <span className={estimate ? "italic text-[#8a7437]" : ""}>{priceText(r.call)}</span>
                      </td>
                      <td className={`whitespace-nowrap px-1 py-1 text-right ${ci}`}>
                        <button type="button" disabled={!r.call.price} onClick={() => add(r.strike, "CE", "BUY", r.call)} aria-label={`Buy ${r.strike} call`} className={`${btn} bg-brand-buy/10 text-[#0b6b30] disabled:opacity-30`}>
                          B
                        </button>{" "}
                        <button type="button" disabled={!r.call.price} onClick={() => add(r.strike, "CE", "SELL", r.call)} aria-label={`Sell ${r.strike} call`} className={`${btn} bg-brand-sell/10 text-[#9b1111] disabled:opacity-30`}>
                          S
                        </button>
                      </td>
                      <td className={`px-0 py-0 text-center font-bold ${atm ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-navy"}`}>
                        <button type="button" onClick={() => onPick?.(r.strike)} title="Open in the contract picker" className="w-full px-3 py-1 hover:underline">
                          {fmt(r.strike, r.strike % 1 ? 1 : 0)}
                        </button>
                      </td>
                      <td className={`whitespace-nowrap px-1 py-1 ${pi}`}>
                        <button type="button" disabled={!r.put.price} onClick={() => add(r.strike, "PE", "BUY", r.put)} aria-label={`Buy ${r.strike} put`} className={`${btn} bg-brand-buy/10 text-[#0b6b30] disabled:opacity-30`}>
                          B
                        </button>{" "}
                        <button type="button" disabled={!r.put.price} onClick={() => add(r.strike, "PE", "SELL", r.put)} aria-label={`Sell ${r.strike} put`} className={`${btn} bg-brand-sell/10 text-[#9b1111] disabled:opacity-30`}>
                          S
                        </button>
                      </td>
                      <td className={`px-2 py-1 text-right font-semibold text-brand-navy ${pi}`}>
                        <Warn q={r.put} />
                        <span className={estimate ? "italic text-[#8a7437]" : ""}>{priceText(r.put)}</span>
                      </td>
                      <td className={`px-2 py-1 text-right ${pi}`}>
                        <Fig f={r.put.greeks.delta} data={data} />
                      </td>
                      <td className={`px-2 py-1 text-right ${pi}`}>
                        <Fig f={r.put.greeks.iv} data={data} digits={1} scale={100} />
                      </td>
                      <td className={`px-2 py-1 text-right ${pOi == null ? "text-brand-navy/30" : pOi >= 0 ? "text-[#0b6b30]" : "text-[#9b1111]"} ${pi}`}>{pOi == null ? "—" : `${fmt(pOi, 0)}%`}</td>
                      <td className={`relative px-2 py-1 text-right ${pi}`}>
                        <span className="absolute inset-y-1 left-0 bg-brand-buy/10" style={{ width: `${((r.put.oi ?? 0) / maxOi) * 100}%` }} />
                        <span className="relative">{lakh(r.put.oi)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-brand-navy/50">
            <span>
              Shaded = in the money · B/S adds a leg at the ask/bid · <AlertTriangle size={10} className="inline text-[#b26b00]" /> = a warning about that price (hover) · Colours:{" "}
              <span className={ORIGIN_STYLE.provided.cls}>from {data.source.kind === "estimate" ? "source" : data.source.name}</span>, <span className={ORIGIN_STYLE.calculated.cls}>calculated by us from the price</span>,{" "}
              <span className={ORIGIN_STYLE.estimated.cls}>estimated from an assumed volatility</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-primary">
              <label className="flex items-center gap-1.5">
                Strikes shown
                <select value={window_} onChange={(e) => (setWindow(Number(e.target.value)), setPage(1))} className="rounded border border-brand-navy/15 bg-white px-1.5 py-0.5 text-[11px] text-brand-navy">
                  <option value={6}>±6 from the money</option>
                  <option value={12}>±12 from the money</option>
                  <option value={25}>±25 from the money</option>
                  <option value={0}>All {data.strikes.length}, in pages</option>
                </select>
              </label>
              {window_ === 0 && (
                <>
                  <select aria-label="Strikes per page" value={size} onChange={(e) => (setSize(Number(e.target.value)), setPage(1))} className="rounded border border-brand-navy/15 bg-white px-1.5 py-0.5 text-[11px] text-brand-navy">
                    {CHAIN_PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} per page
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="rounded px-1.5 disabled:opacity-30">
                    ‹ Prev
                  </button>
                  <span className="font-normal text-brand-navy/55">
                    Page {data.page} of {data.pages}
                  </span>
                  <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} className="rounded px-1.5 disabled:opacity-30">
                    Next ›
                  </button>
                </>
              )}
            </span>
          </div>
        </>
      )}
      {!data && !error && <p className="px-4 py-10 text-center text-sm text-brand-navy/45">Loading the option chain…</p>}
    </section>
  );
}
