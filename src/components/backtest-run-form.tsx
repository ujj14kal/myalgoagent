"use client";

import { useState, useTransition } from "react";
import { friendlyError } from "@/lib/friendly-error";
import Link from "next/link";
import { runBacktestAction, runBacktestsAction } from "@/lib/backtest-actions";
import { backtestCost } from "@/lib/credits/config";
import { describeExecutionConfig, type StrategyExecutionConfig } from "@/lib/describe-strategy-config";
import { isIntraday, isValidCombo, type CandleInterval, type CandleRange, type HistoryDepth } from "@/lib/market-data";

interface StrategyOption extends StrategyExecutionConfig {
  id: string;
  name: string;
  instrumentSymbol: string;
}

const RANGES: { value: CandleRange; label: string }[] = [
  { value: "5d", label: "5 days" },
  { value: "1mo", label: "1 month" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "5y", label: "5 years" },
  { value: "max", label: "All available" },
];

/** Periods the data source keeps for a timeframe (intraday history is limited; the licensed feed keeps far more). */
function rangesFor(timeframe: string | undefined, depth: HistoryDepth): typeof RANGES {
  const tf = (timeframe ?? "1d") as CandleInterval;
  if (!isIntraday(tf)) return RANGES.filter((r) => r.value !== "5d" && r.value !== "1mo");
  return RANGES.filter((r) => isValidCombo(r.value, tf, depth));
}

export default function BacktestRunForm({ strategies, depth = "standard", notice = null }: { strategies: StrategyOption[]; depth?: HistoryDepth; notice?: { text: string; hints: { broker: string; hint: string }[] } | null }) {
  // One or several strategies: several are run together (each on its own capital) and shown as one combined result.
  const [selected, setSelected] = useState<string[]>(strategies[0] ? [strategies[0].id] : []);
  const [startingCapital, setStartingCapital] = useState(100000);
  const [brokeragePercent, setBrokeragePercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.05);
  const [range, setRange] = useState<CandleRange>("1y");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chosen = strategies.filter((s) => selected.includes(s.id));
  const selectedStrategy = chosen.length === 1 ? chosen[0] : undefined;
  // A period has to suit every chosen strategy's timeframe.
  const periods = chosen.length ? chosen.map((s) => rangesFor(s.timeframe, depth)).reduce((acc, list) => acc.filter((r) => list.some((x) => x.value === r.value))) : rangesFor(undefined, depth);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 8 ? cur : [...cur, id]));
  // Keep the chosen period valid for the selected strategy's timeframe.
  const effectiveRange = periods.length ? (periods.some((p) => p.value === range) ? range : periods[periods.length - 1].value) : range;

  // What this run will take: by timeframe and period, added up across the strategies ticked.
  const cost = chosen.length ? chosen.reduce((sum, st) => sum + backtestCost({ timeframe: st.timeframe ?? "1d", range: effectiveRange }), 0) : 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (selected.length === 0) return setError("Pick at least one strategy.");
        const result =
          selected.length === 1
            ? await runBacktestAction({ strategyId: selected[0], startingCapital, brokeragePercent, slippagePercent, range: effectiveRange })
            : await runBacktestsAction({ strategyIds: selected, startingCapital, brokeragePercent, slippagePercent, range: effectiveRange });
        if (result?.error) setError(result.error);
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError(friendlyError(err, "Couldn't start the backtest — please try again."));
      }
    });
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-navy/15 p-6 text-sm text-brand-navy/60">
        You need a strategy before you can run a backtest.{" "}
        <Link href="/app/strategies/new" className="font-medium text-brand-primary hover:underline">
          Create one first →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Strategies <span className="font-normal normal-case tracking-normal text-brand-navy/45">— tick several to backtest them together (up to 8)</span>
          </label>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-brand-navy/15 p-1.5">
            {strategies.map((st) => {
              const on = selected.includes(st.id);
              return (
                <label key={st.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${on ? "bg-brand-primary/[0.07]" : "hover:bg-brand-bg"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(st.id)} className="h-4 w-4 accent-[#471898]" />
                  <span className="min-w-0 flex-1 truncate text-brand-navy">
                    {st.name} <span className="text-brand-navy/50">({st.instrumentSymbol})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Capital (₹)</label>
          <input
            type="number"
            min={1}
            value={startingCapital}
            onChange={(e) => setStartingCapital(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Brokerage (%)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={brokeragePercent}
            onChange={(e) => setBrokeragePercent(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Slippage (%)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={slippagePercent}
            onChange={(e) => setSlippagePercent(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      {selected.length > 1 && (
        <div className="mt-4 rounded-xl border border-brand-navy/10 bg-brand-bg p-3 text-xs text-brand-navy/60">
          <span className="font-semibold text-brand-navy/70">{selected.length} strategies together:</span> each runs with its own saved settings and the capital above, then you see one combined account value, each strategy&rsquo;s contribution and every trade side by side.
        </div>
      )}
      {selectedStrategy && (
        <div className="mt-4 rounded-xl border border-brand-navy/10 bg-brand-bg p-3 text-xs text-brand-navy/60">
          <span className="font-semibold text-brand-navy/70">Using this strategy&rsquo;s configured execution settings:</span>{" "}
          {describeExecutionConfig(selectedStrategy)}.{" "}
          <Link href={`/app/strategies/${selectedStrategy.id}`} className="font-medium text-brand-primary hover:underline">
            Edit the strategy
          </Link>{" "}
          to change position sizing, stop-loss, target, trailing stop or pyramiding.
        </div>
      )}

      <div className="mt-4 flex items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Period</label>
          <select
            value={effectiveRange}
            onChange={(e) => setRange(e.target.value as CandleRange)}
            className="rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          >
            {periods.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Running…" : `Run Backtest · ${cost} credit${cost === 1 ? "" : "s"}`}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-brand-sell">{error}</p>}
      {notice && (
        <div className="mt-4 rounded-xl bg-brand-gold/10 p-3 text-xs text-brand-navy/75" role="note">
          <p className="font-semibold text-brand-navy">For more accurate results</p>
          <p className="mt-0.5">{notice.text}</p>
          {notice.hints.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {notice.hints.map((h) => (
                <li key={h.broker}>
                  <span className="font-semibold">{h.broker}:</span> {h.hint}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
