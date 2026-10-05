"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import type { OptionLeg } from "@/lib/options/positions";
import { FLAG_TEXT, GREEKS, NOTICE_TEXT, type GreekName } from "@/lib/options/chain";
import { expiryLabel, fmt, legFrom, priceText, originTitle, ORIGIN_STYLE, sourceLabel, type ChainResponse } from "./chain-types";
import { useChain } from "./use-chain";

// Pick one contract — underlying, expiry, call or put, strike — and see its price, depth, open
// interest and all six Greeks, each labelled with where it came from, plus any warning about
// the price (stale, one-sided, wide spread, expired…). Buy/Sell adds it as a leg.

const GREEK_INFO: Record<GreekName, { label: string; hint: string; digits: number; scale?: number; suffix?: string }> = {
  iv: { label: "IV", hint: "Implied volatility — the yearly move the price implies", digits: 1, scale: 100, suffix: "%" },
  delta: { label: "Delta", hint: "Price change for a ₹1 move in the underlying", digits: 3 },
  gamma: { label: "Gamma", hint: "How fast delta changes per ₹1 move", digits: 5 },
  theta: { label: "Theta", hint: "Value lost per day from time passing", digits: 2 },
  vega: { label: "Vega", hint: "Price change for a 1-point rise in IV", digits: 2 },
  rho: { label: "Rho", hint: "Price change for a 1-point rise in interest rates", digits: 2 },
};

export type Pick = { strike: number | null; type: "CE" | "PE" };

export default function ContractPicker({
  underlying,
  onUnderlying,
  expiry,
  onExpiry,
  pick,
  onPick,
  chain,
  onAdd,
  lots,
}: {
  underlying: string;
  onUnderlying: (u: string) => void;
  expiry: string | null;
  onExpiry: (e: string) => void;
  pick: Pick;
  /** Merged into the current pick (so quick successive changes never undo each other). */
  onPick: (patch: Partial<Pick>) => void;
  /** The chain the table loaded (expiries, strikes, source) — the picker reuses it. */
  chain: ChainResponse | null;
  onAdd: (leg: OptionLeg) => void;
  lots: number;
}) {
  const [underlyings, setUnderlyings] = useState<string[]>(["NIFTY", "BANKNIFTY"]);
  const [typed, setTyped] = useState(underlying);
  useEffect(() => {
    fetch("/api/options/underlyings")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.underlyings) && d.underlyings.length && setUnderlyings(d.underlyings))
      .catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the box in step when the underlying changes elsewhere
  useEffect(() => setTyped(underlying), [underlying]);

  const strike = pick.strike ?? chain?.atmStrike ?? null;
  const one = useChain({ underlying, expiry: chain?.expiry ?? expiry, strike: strike ?? undefined }, strike !== null && !!chain);
  const data = one.data && one.data.rows[0]?.strike === strike ? one.data : null;
  const q = data ? (pick.type === "CE" ? data.rows[0].call : data.rows[0].put) : null;
  const add = (side: "BUY" | "SELL") => {
    const leg = data && q && strike !== null ? legFrom(data, strike, pick.type, side, q, lots) : null;
    if (leg) onAdd(leg);
  };
  const choose = (u: string) => {
    const v = u.trim().toUpperCase();
    if (v && v !== underlying) {
      onUnderlying(v);
      onPick({ strike: null });
    }
  };
  const inputCls = "rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";

  return (
    <section className="surface p-4 sm:p-5">
      <p className="text-sm font-semibold text-brand-navy">Pick a contract</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-brand-navy/45">Underlying</span>
          <input
            list="option-underlyings"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={() => choose(typed)}
            onKeyDown={(e) => e.key === "Enter" && choose(typed)}
            placeholder="NIFTY, BANKNIFTY, RELIANCE…"
            className={`${inputCls} w-full`}
          />
          <datalist id="option-underlyings">
            {underlyings.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-brand-navy/45">Expiry</span>
          <select value={chain?.expiry ?? ""} disabled={!chain} onChange={(e) => (onExpiry(e.target.value), onPick({ strike: null }))} className={`${inputCls} w-full`}>
            {(chain?.expiries ?? []).map((d) => (
              <option key={d} value={d}>
                {expiryLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-brand-navy/45">Call or put</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Call or put">
            {(["CE", "PE"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={pick.type === t} onClick={() => onPick({ type: t })} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold ring-1 ${pick.type === t ? "bg-brand-navy text-white ring-brand-navy" : "text-brand-navy/65 ring-brand-navy/15"}`}>
                {t === "CE" ? "Call (CE)" : "Put (PE)"}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-brand-navy/45">Strike</span>
          <select value={strike ?? ""} disabled={!chain} onChange={(e) => onPick({ strike: Number(e.target.value) })} className={`${inputCls} w-full`}>
            {(chain?.strikes ?? []).map((k) => (
              <option key={k} value={k}>
                {fmt(k, k % 1 ? 1 : 0)}
                {k === chain?.atmStrike ? " (at the money)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chain && (
        <div className="mt-3 space-y-1.5 text-xs">
          <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${chain.source.kind === "estimate" ? "bg-brand-gold/15 text-[#8a7437]" : "bg-brand-buy/10 text-[#0b6b30]"}`}>{sourceLabel(chain.source)}</p>
          {chain.brokerIssues.map((i) => (
            <p key={i.broker} className="text-brand-navy/60">
              {i.name}: {i.reason}
            </p>
          ))}
          {chain.notices.map((n) => (
            <p key={n} className="flex items-start gap-1.5 text-brand-navy/70">
              <Info size={13} className="mt-0.5 shrink-0 text-brand-primary" /> {NOTICE_TEXT[n]}
            </p>
          ))}
        </div>
      )}

      {data && q && strike !== null && (
        <div className="mt-4 rounded-xl bg-brand-bg/70 p-4 ring-1 ring-black/5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-brand-navy">
              {data.underlying} {expiryLabel(data.expiry)} {fmt(strike, strike % 1 ? 1 : 0)} {pick.type === "CE" ? "Call" : "Put"}
              {q.symbol && <span className="ml-2 font-mono text-[11px] font-normal text-brand-navy/45">{q.symbol}</span>}
            </p>
            <div className="flex gap-1.5">
              <button type="button" disabled={!q.price} onClick={() => add("BUY")} className="rounded-full bg-brand-buy/10 px-3 py-1 text-xs font-bold text-[#0b6b30] disabled:opacity-30">
                Buy · add leg
              </button>
              <button type="button" disabled={!q.price} onClick={() => add("SELL")} className="rounded-full bg-brand-sell/10 px-3 py-1 text-xs font-bold text-[#9b1111] disabled:opacity-30">
                Sell · add leg
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
            {[
              [data.source.kind === "estimate" ? "Est. price" : q.basis === "mid" ? "Mid price" : "Last price", priceText(q)],
              ["Bid / ask", data.hasDepth ? `${fmt(q.bid)} / ${fmt(q.ask)}` : "not given"],
              ["Last traded", fmt(q.ltp)],
              ["Volume", q.volume == null ? "—" : q.volume.toLocaleString("en-IN")],
              ["Open interest", q.oi == null ? "—" : q.oi.toLocaleString("en-IN")],
              ["Lot size", data.lotSize ? String(data.lotSize) : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="font-semibold uppercase tracking-wide text-brand-navy/45">{k}</p>
                <p className="text-sm font-bold tabular-nums text-brand-navy">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
            {GREEKS.map((g) => {
              const f = q.greeks[g];
              const info = GREEK_INFO[g];
              return (
                <div key={g} className="rounded-lg bg-white px-3 py-2 ring-1 ring-black/5" title={info.hint}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">{info.label}</p>
                  <p className="text-base font-bold tabular-nums text-brand-navy">{f.value === null ? "—" : `${fmt(f.value * (info.scale ?? 1), info.digits)}${info.suffix ?? ""}`}</p>
                  <p title={originTitle(f.origin, data.source)} className={`text-[10px] font-semibold ${f.origin ? ORIGIN_STYLE[f.origin].cls : "text-brand-navy/40"}`}>
                    {f.origin === "provided" ? `from ${data.source.name}` : f.origin ? ORIGIN_STYLE[f.origin].label : "not available"}
                  </p>
                </div>
              );
            })}
          </div>
          {q.flags.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[#8a5a00]">
              {q.flags.map((f) => (
                <li key={f} className="flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {FLAG_TEXT[f]}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-brand-navy/50">
            Our calculations use Black–Scholes with the underlying at {fmt(data.spot)}, {fmt(data.daysToExpiry, 2)} days to expiry (15:30 IST) and a {fmt(data.rate * 100, 1)}% interest rate. Theta is per calendar day; vega and rho per 1 point. Figures
            from your broker may use slightly different inputs. A calculator for understanding a contract, not advice.
          </p>
        </div>
      )}
      {!data && one.loading && <p className="mt-4 text-sm text-brand-navy/45">Loading the contract…</p>}
    </section>
  );
}
