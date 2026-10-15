"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ConditionOverridesContext, StrategyTimeframeContext, defaultComparison } from "@/components/condition-group-editor";
import SimpleConditionPicker, { ALL_CATEGORIES } from "@/components/simple-condition-picker";
import InfoTip from "@/components/ui/info-tip";
import { DEFAULT_LAST_ENTRY, RULE_TIMEFRAMES, type OptionRules, type RuleChart } from "@/lib/options/rules";
import type { CandleInterval } from "@/lib/market-data";
import { STRATEGY_TEMPLATES } from "@/lib/options/positions";
import { saveOptionStrategy, type OptionStrategyInput } from "@/lib/option-strategy-actions";
import { EMPTY_STRATEGY } from "@/lib/options/empty-strategy";
import type { ExpiryRule, RiskUnit, StrategyLeg } from "@/lib/options/backtest-engine";

const inputCls = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45";
const TF: Record<number, CandleInterval> = { 1: "1m", 3: "3m", 5: "5m", 15: "15m" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">{n}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy">{title}</p>
          {hint && <p className="text-xs text-brand-navy/50">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Create or edit a multi-leg options strategy (strikes relative to ATM). */
export default function StrategyEditor({ initial = EMPTY_STRATEGY, onDone, onCancel, onChange }: { initial?: OptionStrategyInput; onDone?: () => void; /** Cancel button; defaults to `onDone` where callers use one callback for both. */ onCancel?: () => void; /** Told about every edit, so a full page can show a live reading of the strategy beside the form. */ onChange?: (s: OptionStrategyInput) => void }) {
  const [s, setS] = useState<OptionStrategyInput>(initial);
  useEffect(() => {
    onChange?.(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report edits only, not a new callback each render
  }, [s]);
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

  const risk = (label: string, unitKey: "stopLossUnit" | "targetUnit" | "trailUnit", valueKey: "stopLossValue" | "targetValue" | "trailValue") => (
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

  const rules = s.rules ?? null;
  const setRules = (patch: Partial<OptionRules> | null) => set("rules", patch === null ? null : { chart: "FUTURE", timeframe: 5, entry: null, exit: null, lastEntryMinute: DEFAULT_LAST_ENTRY, ...(rules ?? {}), ...patch });

  const ruleEditor = (key: "entry" | "exit") => {
    const node = rules?.[key];
    return node ? (
      <div className="space-y-3">
        <SimpleConditionPicker node={node} onChange={(n) => setRules({ [key]: n })} instruments={[]} categories={ALL_CATEGORIES} purpose={key} />
        <button type="button" onClick={() => setRules({ [key]: null })} className="text-xs font-semibold text-brand-navy/50 hover:text-brand-sell">
          Remove this rule
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => setRules({ [key]: defaultComparison() })} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
        <Plus size={13} /> {key === "entry" ? "Wait for a signal before entering" : "Add an exit signal"}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Step n={1} title="What to trade" hint="The underlying and which expiry the options come from.">
        <div className="grid gap-3 sm:grid-cols-2">
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
      </Step>

      <Step n={2} title="Legs" hint="Each leg is a call or put, bought or sold, a number of strikes from the at-the-money strike.">
        <p className={labelCls}>Start from</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
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
        <div className="space-y-3">
          {s.legs.map((l, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-3 rounded-xl bg-brand-bg/60 p-3 sm:grid-cols-[1fr_1fr_1.2fr_5rem_auto]">
              <label className="block">
                <span className={labelCls}>Buy / Sell</span>
                <select value={l.side} onChange={(e) => setLeg(i, { side: e.target.value as StrategyLeg["side"] })} className={`${inputCls} font-semibold ${l.side === "BUY" ? "text-brand-buy" : "text-brand-sell"}`}>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Type</span>
                <select value={l.type} onChange={(e) => setLeg(i, { type: e.target.value as StrategyLeg["type"] })} className={inputCls}>
                  <option value="CE">Call (CE)</option>
                  <option value="PE">Put (PE)</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls} title="Strikes above (+) or below (−) the at-the-money strike">Strike vs ATM</span>
                <select value={l.offset} onChange={(e) => setLeg(i, { offset: Number(e.target.value) })} className={inputCls}>
                  {Array.from({ length: 21 }, (_, k) => k - 10).map((o) => (
                    <option key={o} value={o}>
                      {o === 0 ? "ATM" : o > 0 ? `ATM +${o}` : `ATM ${o}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Lots</span>
                <input type="number" min={1} max={50} value={l.lots} onChange={(e) => setLeg(i, { lots: Math.max(1, Math.round(Number(e.target.value))) })} className={inputCls} />
              </label>
              <button type="button" onClick={() => set("legs", s.legs.filter((_, j) => j !== i))} aria-label="Remove leg" className="justify-self-end pb-2 text-brand-navy/35 hover:text-brand-sell">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {s.legs.length < 6 && (
          <button type="button" onClick={() => set("legs", [...s.legs, { type: "CE", side: "BUY", offset: 0, lots: 1 }])} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
            <Plus size={13} /> Add leg
          </button>
        )}
      </Step>

      <Step n={3} title="Timing and days" hint="When the trade may start, when it is squared off, and on which days.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>{rules?.entry ? "Watch for the entry signal from (IST)" : "Entry time (IST)"}</span>
            <input type="time" min="09:15" max="15:29" value={toTime(s.entryMinute)} onChange={(e) => set("entryMinute", fromTime(e.target.value))} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Square-off (IST)</span>
            <input type="time" min="09:16" max="15:30" value={toTime(s.exitMinute)} onChange={(e) => set("exitMinute", fromTime(e.target.value))} className={inputCls} />
          </label>
          {rules?.entry && (
            <label className="block">
              <span className={labelCls}>No new entry after (IST)</span>
              <input type="time" min="09:16" max="15:29" value={toTime(rules.lastEntryMinute)} onChange={(e) => setRules({ lastEntryMinute: fromTime(e.target.value) })} className={inputCls} />
            </label>
          )}
        </div>
        <p className={`${labelCls} mt-4`}>Trade on</p>
        <div className="flex flex-wrap gap-1.5">
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
      </Step>

      <Step n={4} title="Entry and exit signals (optional)" hint="Without these the trade enters and exits at the times above. With them, the same conditions as a regular strategy decide.">
        {!rules ? (
          <button type="button" onClick={() => setRules({})} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
            <Plus size={13} /> Add entry / exit signals
          </button>
        ) : (
          <div className="space-y-5">
            <div>
              <p className={`${labelCls} flex items-center gap-1.5`}>
                Read the signals on <InfoTip>The Future chart is the underlying&apos;s own chart (NIFTY, BANKNIFTY…). The Option chart is the strategy&apos;s combined premium: what the legs together pay or cost, which moves with the options maths: time decay, volatility and distance from spot.</InfoTip>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["FUTURE", "Future chart", "The underlying's chart. Indicators get a few earlier days as warm-up."],
                  ["OPTION", "Option chart", "The combined premium of your legs, that day's candles only."],
                ] as [RuleChart, string, string][]).map(([k, t, d]) => (
                  <button key={k} type="button" aria-pressed={rules.chart === k} onClick={() => setRules({ chart: k })} className={`rounded-xl border p-3 text-left ${rules.chart === k ? "border-brand-primary bg-brand-primary/[0.05]" : "border-brand-navy/15"}`}>
                    <span className="block text-sm font-semibold text-brand-navy">{t}</span>
                    <span className="block text-xs text-brand-navy/55">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="block max-w-[12rem]">
              <span className={labelCls}>Candle size</span>
              <select value={rules.timeframe} onChange={(e) => setRules({ timeframe: Number(e.target.value) as OptionRules["timeframe"] })} className={inputCls}>
                {RULE_TIMEFRAMES.map((m) => (
                  <option key={m} value={m}>
                    {m} minute{m === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <StrategyTimeframeContext.Provider value={TF[rules.timeframe]}>
              <ConditionOverridesContext.Provider value={false}>
                <div>
                  <p className={labelCls}>Entry signal</p>
                  {ruleEditor("entry")}
                </div>
                <div className="mt-5">
                  <p className={labelCls}>Exit signal</p>
                  {ruleEditor("exit")}
                </div>
              </ConditionOverridesContext.Provider>
            </StrategyTimeframeContext.Provider>
            <p className="text-xs text-brand-navy/50">A signal is read when its candle closes and acted on at the next candle&apos;s open, so a backtest never uses a price it couldn&apos;t have had. The stop-loss, target and square-off below still apply.</p>
            <button type="button" onClick={() => setRules(null)} className="text-xs font-semibold text-brand-navy/50 hover:text-brand-sell">
              Remove signals and use the times only
            </button>
          </div>
        )}
      </Step>

      <Step n={5} title="Risk" hint="Applied to the whole position, in rupees or as a share of the premium.">
        <div className="grid gap-3 sm:grid-cols-2">
          {risk("Stop-loss (whole position)", "stopLossUnit", "stopLossValue")}
          {risk("Target (whole position)", "targetUnit", "targetValue")}
          {risk("Trailing stop (from the best profit so far)", "trailUnit", "trailValue")}
        </div>
      </Step>

      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : s.id ? "Save changes" : "Save strategy"}
        </button>
        {(onCancel ?? onDone) && (
          <button type="button" onClick={onCancel ?? onDone} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-navy/60">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
