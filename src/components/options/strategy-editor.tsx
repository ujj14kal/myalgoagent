"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { STRATEGY_TEMPLATES } from "@/lib/options/positions";
import { saveOptionStrategy, type OptionStrategyInput } from "@/lib/option-strategy-actions";
import type { ExpiryRule, RiskUnit, StrategyLeg } from "@/lib/options/backtest-engine";

const inputCls = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const EMPTY_STRATEGY: OptionStrategyInput = {
  name: "NIFTY short straddle",
  underlying: "NIFTY",
  legs: [
    { type: "CE", side: "SELL", offset: 0, lots: 1 },
    { type: "PE", side: "SELL", offset: 0, lots: 1 },
  ],
  expiryRule: "WEEKLY_CURRENT",
  entryMinute: 9 * 60 + 20,
  exitMinute: 15 * 60 + 15,
  weekdays: [1, 2, 3, 4, 5],
  stopLossUnit: "RUPEES",
  stopLossValue: 3000,
  targetUnit: null,
  targetValue: null,
};

/** Create or edit a multi-leg options strategy (strikes relative to ATM). */
export default function StrategyEditor({ initial = EMPTY_STRATEGY, onDone }: { initial?: OptionStrategyInput; onDone?: () => void }) {
  const [s, setS] = useState<OptionStrategyInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof OptionStrategyInput>(k: K, v: OptionStrategyInput[K]) => setS((p) => ({ ...p, [k]: v }));
  const setLeg = (i: number, patch: Partial<StrategyLeg>) => set("legs", s.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = () =>
    start(async () => {
      const r = await saveOptionStrategy(s);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
      onDone?.();
    });

  const risk = (label: string, unitKey: "stopLossUnit" | "targetUnit", valueKey: "stopLossValue" | "targetValue") => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <div className="flex gap-1.5">
        <select value={s[unitKey] ?? ""} onChange={(e) => set(unitKey, (e.target.value || null) as RiskUnit | null)} className={`${inputCls} w-32`}>
          <option value="">None</option>
          <option value="RUPEES">₹ amount</option>
          <option value="PREMIUM_PCT">% of premium</option>
        </select>
        {s[unitKey] && <input type="number" min={0} step="any" value={s[valueKey] ?? ""} onChange={(e) => set(valueKey, Number(e.target.value) || null)} className={inputCls} />}
      </div>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className={labelCls}>Name</span>
          <input value={s.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Underlying</span>
          <input list="opt-underlyings" value={s.underlying} onChange={(e) => set("underlying", e.target.value.toUpperCase())} className={inputCls} />
          <datalist id="opt-underlyings">
            <option value="NIFTY" />
            <option value="BANKNIFTY" />
          </datalist>
        </label>
        <label className="block">
          <span className={labelCls}>Expiry</span>
          <select value={s.expiryRule} onChange={(e) => set("expiryRule", e.target.value as ExpiryRule)} className={inputCls}>
            <option value="WEEKLY_CURRENT">Nearest expiry</option>
            <option value="WEEKLY_NEXT">Next expiry</option>
            <option value="MONTHLY">Monthly expiry</option>
          </select>
        </label>
      </div>

      <div>
        <p className={labelCls}>Start from</p>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.view}
              onClick={() => set("legs", t.legs.map((l) => ({ type: l.type, side: l.side, offset: l.offset, lots: 1 })))}
              className="rounded-full border border-brand-navy/15 px-3 py-1 text-xs font-semibold text-brand-navy/65 hover:border-brand-primary"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-brand-navy/45">
            <th className="pb-1.5 pr-2 font-semibold">Buy / Sell</th>
            <th className="pb-1.5 pr-2 font-semibold">Type</th>
            <th className="pb-1.5 pr-2 font-semibold" title="Strikes above (+) or below (−) the at-the-money strike">Strike vs ATM</th>
            <th className="pb-1.5 pr-2 font-semibold">Lots</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.legs.map((l, i) => (
            <tr key={i} className="border-t border-black/5">
              <td className="py-1.5 pr-2">
                <select value={l.side} onChange={(e) => setLeg(i, { side: e.target.value as StrategyLeg["side"] })} className={`${inputCls} font-semibold ${l.side === "BUY" ? "text-brand-buy" : "text-brand-sell"}`}>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </td>
              <td className="py-1.5 pr-2">
                <select value={l.type} onChange={(e) => setLeg(i, { type: e.target.value as StrategyLeg["type"] })} className={inputCls}>
                  <option value="CE">Call (CE)</option>
                  <option value="PE">Put (PE)</option>
                </select>
              </td>
              <td className="py-1.5 pr-2">
                <select value={l.offset} onChange={(e) => setLeg(i, { offset: Number(e.target.value) })} className={inputCls}>
                  {Array.from({ length: 21 }, (_, k) => k - 10).map((o) => (
                    <option key={o} value={o}>
                      {o === 0 ? "ATM" : o > 0 ? `ATM +${o}` : `ATM ${o}`}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1.5 pr-2">
                <input type="number" min={1} max={50} value={l.lots} onChange={(e) => setLeg(i, { lots: Math.max(1, Math.round(Number(e.target.value))) })} className={`${inputCls} w-20`} />
              </td>
              <td className="py-1.5 text-right">
                <button type="button" onClick={() => set("legs", s.legs.filter((_, j) => j !== i))} aria-label="Remove leg" className="text-brand-navy/35 hover:text-brand-sell">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.legs.length < 6 && (
        <button type="button" onClick={() => set("legs", [...s.legs, { type: "CE", side: "BUY", offset: 0, lots: 1 }])} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
          <Plus size={13} /> Add leg
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={labelCls}>Entry time (IST)</span>
          <input type="time" min="09:15" max="15:29" value={toTime(s.entryMinute)} onChange={(e) => set("entryMinute", fromTime(e.target.value))} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Square-off (IST)</span>
          <input type="time" min="09:16" max="15:30" value={toTime(s.exitMinute)} onChange={(e) => set("exitMinute", fromTime(e.target.value))} className={inputCls} />
        </label>
        {risk("Stop-loss (whole position)", "stopLossUnit", "stopLossValue")}
        {risk("Target (whole position)", "targetUnit", "targetValue")}
      </div>
      <div>
        <p className={labelCls}>Trade on</p>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = s.weekdays.includes(i + 1);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set("weekdays", on ? s.weekdays.filter((w) => w !== i + 1) : [...s.weekdays, i + 1])}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy/55 ring-1 ring-brand-navy/10"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : s.id ? "Save changes" : "Save strategy"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-navy/60">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
