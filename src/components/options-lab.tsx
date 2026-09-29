"use client";

import { useMemo, useState } from "react";
import { Info, Plus, Trash2 } from "lucide-react";
import {
  STRATEGY_TEMPLATES,
  buildTemplate,
  payoffAtExpiry,
  payoffNow,
  positionGreeks,
  summarize,
  type OptionLeg,
} from "@/lib/options/positions";
import OptionChain, { type ChainContext } from "@/components/option-chain";
import LiveBasket, { type BasketBroker } from "@/components/options/live-basket";

// Options Lab: a multi-leg payoff, breakeven and Greeks calculator. Works on
// typed-in (or theoretical) premiums today; once a live option chain is
// connected the strikes, premiums and IV will come from real quotes.

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inputCls = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45";

type Settings = { spot: number; step: number; expiryDays: number; ivPct: number; ratePct: number; lots: number; lotSize: number };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, step = "any" }: { value: number; onChange: (v: number) => void; step?: string }) {
  return <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} />;
}

/** A leg's live price from the chain: mid of bid/ask when both exist, else the last trade. */
function livePrice(ctx: ChainContext, type: "CE" | "PE", strike: number): { premium: number; iv: number | null } | null {
  const row = ctx.rows.find((r) => r.strike === strike);
  const q = row ? (type === "CE" ? row.call : row.put) : null;
  if (!q) return null;
  const premium = q.bid && q.ask ? Math.round(((q.bid + q.ask) / 2) * 20) / 20 : q.ltp;
  return premium ? { premium, iv: q.iv || null } : null;
}

export default function OptionsLab({ live = false, basketBrokers = [] }: { live?: boolean; basketBrokers?: BasketBroker[] }) {
  const [s, setS] = useState<Settings>({ spot: 25000, step: 50, expiryDays: 7, ivPct: 13, ratePct: 6.5, lots: 1, lotSize: 75 });
  const [template, setTemplate] = useState("iron-condor");
  const [legs, setLegs] = useState<OptionLeg[]>(() =>
    buildTemplate("iron-condor", { spot: 25000, step: 50, expiryDays: 7, iv: 0.13, rate: 0.065, lots: 1, lotSize: 75 }),
  );
  const rate = s.ratePct / 100;
  const [ctx, setCtx] = useState<ChainContext | null>(null);

  const apply = (id: string, next = s) => {
    setTemplate(id);
    const built = buildTemplate(id, { spot: next.spot, step: next.step, expiryDays: next.expiryDays, iv: next.ivPct / 100, rate: next.ratePct / 100, lots: next.lots, lotSize: next.lotSize });
    // With a live chain, every leg is priced from real quotes instead of the model.
    setLegs(
      ctx
        ? built.map((l) => {
            const q = livePrice(ctx, l.type, l.strike);
            return q ? { ...l, premium: q.premium, iv: q.iv ?? l.iv } : l;
          })
        : built,
    );
  };
  const onContext = (c: ChainContext) => {
    setCtx(c);
    setS((prev) => ({ ...prev, spot: c.spot, step: c.step, expiryDays: Math.round(c.daysToExpiry * 100) / 100, lotSize: c.lotSize, ivPct: c.atmIv ? Math.round(c.atmIv * 1000) / 10 : prev.ivPct }));
  };
  const setLeg = (i: number, patch: Partial<OptionLeg>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const summary = useMemo(() => summarize(legs), [legs]);
  const greeks = useMemo(() => positionGreeks(legs, s.spot, rate), [legs, s.spot, rate]);

  return (
    <div className="mt-6 space-y-5">
      {live ? (
        <>
          <OptionChain onAdd={(leg) => setLegs((ls) => [...ls, { ...leg, lots: s.lots }])} onContext={onContext} />
          <p className="flex items-start gap-2 rounded-xl bg-brand-bg px-4 py-3 text-xs leading-relaxed text-brand-navy/70 ring-1 ring-black/5">
            <Info size={15} className="mt-0.5 shrink-0 text-brand-primary" />
            <span>
              Spot, lot size, days to expiry and IV below follow the live chain{ctx ? ` (${ctx.underlying} ${ctx.expiry})` : ""}; strategy templates are priced from real
              quotes. This is a calculator for understanding a position, not advice.
            </span>
          </p>
        </>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-brand-gold/10 px-4 py-3 text-xs leading-relaxed text-brand-navy/75 ring-1 ring-brand-gold/25">
          <Info size={15} className="mt-0.5 shrink-0 text-[#8a7437]" />
          <span>
            Premiums below are <strong>estimates</strong> (Black–Scholes at the IV you set) until a live option chain is connected — replace them with real quotes
            for accurate numbers. Set the lot size for your contract. This is a calculator for understanding a position, not advice.
          </span>
        </p>
      )}

      <section className="surface p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-brand-navy">Underlying & assumptions</p>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Field label="Spot price">
            <Num value={s.spot} onChange={(v) => setS({ ...s, spot: v })} />
          </Field>
          <Field label="Strike step">
            <Num value={s.step} onChange={(v) => setS({ ...s, step: v })} />
          </Field>
          <Field label="Days to expiry">
            <Num value={s.expiryDays} step="1" onChange={(v) => setS({ ...s, expiryDays: v })} />
          </Field>
          <Field label="IV %">
            <Num value={s.ivPct} onChange={(v) => setS({ ...s, ivPct: v })} />
          </Field>
          <Field label="Rate %">
            <Num value={s.ratePct} onChange={(v) => setS({ ...s, ratePct: v })} />
          </Field>
          <Field label="Lots">
            <Num value={s.lots} step="1" onChange={(v) => setS({ ...s, lots: v })} />
          </Field>
          <Field label="Lot size">
            <Num value={s.lotSize} step="1" onChange={(v) => setS({ ...s, lotSize: v })} />
          </Field>
        </div>
        <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Start from a strategy</p>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => apply(t.id)}
              title={t.view}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                template === t.id ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/65 hover:border-brand-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-brand-navy/45">
          {STRATEGY_TEMPLATES.find((t) => t.id === template)?.view} · strikes placed around the at-the-money strike ({Math.round(s.spot / s.step) * s.step}).{" "}
          <button type="button" onClick={() => apply(template)} className="font-semibold text-brand-primary hover:underline">
            Rebuild with these settings
          </button>
        </p>
      </section>

      <section className="surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-navy">Legs</p>
          <button
            type="button"
            onClick={() =>
              setLegs((ls) => [
                ...ls,
                { kind: "OPTION", type: "CE", side: "BUY", strike: Math.round(s.spot / s.step) * s.step, premium: 100, lots: s.lots, lotSize: s.lotSize, expiryDays: s.expiryDays, iv: s.ivPct / 100 },
              ])
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
          >
            <Plus size={13} /> Add leg
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-brand-navy/45">
                <th className="pb-2 pr-2 font-semibold">Buy / Sell</th>
                <th className="pb-2 pr-2 font-semibold">Type</th>
                <th className="pb-2 pr-2 font-semibold">Strike</th>
                <th className="pb-2 pr-2 font-semibold">Premium (₹)</th>
                <th className="pb-2 pr-2 font-semibold">Lots</th>
                <th className="pb-2 pr-2 font-semibold">Days</th>
                <th className="pb-2 pr-2 font-semibold">IV %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {legs.map((l, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className="py-1.5 pr-2">
                    <select value={l.side} onChange={(e) => setLeg(i, { side: e.target.value as OptionLeg["side"] })} className={`${inputCls} min-w-[84px] font-semibold ${l.side === "BUY" ? "text-brand-buy" : "text-brand-sell"}`}>
                      <option value="BUY">Buy</option>
                      <option value="SELL">Sell</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select value={l.type} onChange={(e) => setLeg(i, { type: e.target.value as OptionLeg["type"] })} className={`${inputCls} min-w-[112px]`}>
                      <option value="CE">Call (CE)</option>
                      <option value="PE">Put (PE)</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Num value={l.strike} onChange={(v) => setLeg(i, { strike: v })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Num value={l.premium} onChange={(v) => setLeg(i, { premium: v })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Num value={l.lots} step="1" onChange={(v) => setLeg(i, { lots: v })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Num value={l.expiryDays} step="1" onChange={(v) => setLeg(i, { expiryDays: v })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Num value={Math.round(l.iv * 1000) / 10} onChange={(v) => setLeg(i, { iv: v / 100 })} />
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove leg" className="text-brand-navy/35 hover:text-brand-sell">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {legs.length > 0 && (
        <section className="surface p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={summary.netPremium >= 0 ? "Net credit" : "Net debit"} value={inr(Math.abs(summary.netPremium))} tone={summary.netPremium >= 0 ? "good" : "neutral"} />
            <Stat label="Max profit" value={summary.maxProfit === null ? "Unlimited" : inr(summary.maxProfit)} tone="good" />
            <Stat label="Max loss" value={summary.maxLoss === null ? "Unlimited" : inr(summary.maxLoss)} tone="bad" />
            <Stat label="Breakevens" value={summary.breakevens.length ? summary.breakevens.map((b) => b.toLocaleString("en-IN", { maximumFractionDigits: 1 })).join(" · ") : "—"} />
          </div>
          <PayoffChart legs={legs} spot={s.spot} rate={rate} breakevens={summary.breakevens} />
          {live && ctx && basketBrokers.length > 0 && (
            <div className="mt-4">
              <LiveBasket brokers={basketBrokers} underlying={ctx.underlying} expiry={ctx.expiry} legs={legs} />
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Stat small label="Delta" value={greeks.delta.toFixed(1)} hint="₹ P&L for a ₹1 move up" />
            <Stat small label="Gamma" value={greeks.gamma.toFixed(3)} hint="How fast delta changes" />
            <Stat small label="Theta / day" value={inr(greeks.theta)} hint="Time decay per day" />
            <Stat small label="Vega" value={inr(greeks.vega)} hint="P&L per 1-point rise in IV" />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral", small, hint }: { label: string; value: string; tone?: "good" | "bad" | "neutral"; small?: boolean; hint?: string }) {
  const color = tone === "good" ? "text-brand-buy" : tone === "bad" ? "text-brand-sell" : "text-brand-navy";
  return (
    <div className="rounded-xl bg-brand-bg px-3.5 py-2.5 ring-1 ring-black/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">{label}</p>
      <p className={`${small ? "text-base" : "text-lg"} font-bold ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-brand-navy/45">{hint}</p>}
    </div>
  );
}

/** P&L across underlying prices: at expiry (solid) and today (dashed), with the spot and breakevens marked. */
function PayoffChart({ legs, spot, rate, breakevens }: { legs: OptionLeg[]; spot: number; rate: number; breakevens: number[] }) {
  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(spot, ...strikes) * 0.94;
  const hi = Math.max(spot, ...strikes) * 1.06;
  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const expiry = xs.map((x) => payoffAtExpiry(legs, x));
  const today = xs.map((x) => payoffNow(legs, x, rate, 0));
  const all = [...expiry, ...today, 0];
  const yMin = Math.min(...all);
  const yMax = Math.max(...all);
  const pad = (yMax - yMin) * 0.08 || 1;

  const W = 760;
  const H = 260;
  const L = 64;
  const B = 24;
  const px = (x: number) => L + ((x - lo) / (hi - lo)) * (W - L - 12);
  const py = (y: number) => 10 + ((yMax + pad - y) / (yMax - yMin + 2 * pad)) * (H - B - 10);
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${px(xs[i]).toFixed(1)},${py(y).toFixed(1)}`).join(" ");
  const zero = py(0);
  const area = `${path(expiry)} L${px(hi)},${zero} L${px(lo)},${zero} Z`;
  const ticks = [yMin, 0, yMax].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Payoff chart">
        <defs>
          <clipPath id="above">
            <rect x={0} y={0} width={W} height={zero} />
          </clipPath>
          <clipPath id="below">
            <rect x={0} y={zero} width={W} height={H} />
          </clipPath>
        </defs>
        <path d={area} className="fill-brand-buy/15" clipPath="url(#above)" />
        <path d={area} className="fill-brand-sell/15" clipPath="url(#below)" />
        <line x1={L} x2={W - 12} y1={zero} y2={zero} className="stroke-brand-navy/25" />
        {ticks.map((t) => (
          <text key={t} x={L - 6} y={py(t) + 3} fontSize={10} textAnchor="end" className="fill-brand-navy/50">
            {inr(t)}
          </text>
        ))}
        <path d={path(today)} fill="none" className="stroke-brand-primary/70" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path(expiry)} fill="none" className="stroke-brand-navy" strokeWidth={2} />
        <line x1={px(spot)} x2={px(spot)} y1={10} y2={H - B} className="stroke-brand-primary" strokeDasharray="3 3" />
        <text x={px(spot)} y={H - 8} fontSize={10} textAnchor="middle" className="fill-brand-primary" fontWeight={700}>
          Spot {spot.toLocaleString("en-IN")}
        </text>
        {breakevens.map((b) => (
          <g key={b}>
            <circle cx={px(b)} cy={zero} r={3.5} className="fill-brand-gold" />
            <text x={px(b)} y={zero - 7} fontSize={9.5} textAnchor="middle" className="fill-brand-navy/60">
              {b.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-brand-navy/50">
        <span className="font-semibold text-brand-navy">Solid:</span> P&amp;L at expiry. <span className="font-semibold text-brand-primary">Dashed:</span> estimated P&amp;L
        today at the IV set for each leg. Gold dots: breakevens.
      </p>
    </div>
  );
}
