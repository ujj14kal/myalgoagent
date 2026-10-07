"use client";

import { Plus, Trash2 } from "lucide-react";
import { MAX_TARGETS, validateTargets, type RiskUnit, type TargetLevel, type TargetLock } from "@/lib/trading-engine/step";
import { describeTargets } from "@/lib/describe-targets";

// Target 1–3: sell part of the position at each target, then move the stop on the rest by the rule chosen.

export interface TargetRow {
  unit: RiskUnit;
  value: number;
  exitPercent: number;
  lock: TargetLock["mode"];
  /** MARGIN and TRAIL: the distance and its unit. */
  marginUnit: RiskUnit;
  marginValue: number;
}

const DISTANCE_UNITS: { value: RiskUnit; label: string }[] = [
  { value: "PERCENT", label: "%" },
  { value: "POINTS", label: "Points" },
  { value: "ATR_MULTIPLE", label: "× ATR(14)" },
];
/** Targets can also be a risk/reward multiple: R = the stop-loss distance. */
const UNITS: { value: RiskUnit; label: string }[] = [...DISTANCE_UNITS, { value: "R_MULTIPLE", label: "R (× stop)" }];
/** The same units, worded for what they are measured on. */
const worded = (units: { value: RiskUnit; label: string }[], capital: boolean) => (capital ? units.map((u) => (u.value === "PERCENT" ? { ...u, label: "% of capital" } : u.value === "POINTS" ? { ...u, label: "₹ of capital" } : u)) : units);

const STOP_RULES: { value: TargetLock["mode"]; label: string; help: string }[] = [
  { value: "FIXED", label: "Move to this target", help: "The rest is sold if price falls back to this target's own price." },
  { value: "BREAKEVEN", label: "Move to breakeven", help: "The stop moves to your entry price: the rest can no longer lose." },
  { value: "PREVIOUS", label: "Move to the previous target", help: "The stop moves to the previous target's price (for Target 1, your entry price)." },
  { value: "TRAIL", label: "Trail behind the price", help: "From the next candle the stop follows the best price by the distance you set, and never moves back." },
  { value: "MARGIN", label: "Move to a set distance short of it", help: "A custom stop: the set distance below this target (above, for a short), so price can pull back a little first." },
  { value: "KEEP", label: "Keep it where it was", help: "The stop doesn't move: the original stop-loss (or what an earlier target set) still applies." },
];
const hasDistance = (m: TargetLock["mode"]) => m === "MARGIN" || m === "TRAIL";

export function targetsToRows(levels: TargetLevel[] | undefined): TargetRow[] {
  return (levels ?? []).map((t) => ({
    unit: t.unit,
    value: t.value,
    exitPercent: t.exitPercent,
    lock: t.lock.mode,
    marginUnit: t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL" ? t.lock.unit : t.unit === "R_MULTIPLE" ? "PERCENT" : t.unit,
    marginValue: t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL" ? t.lock.value : 1,
  }));
}

export function rowsToTargets(rows: TargetRow[]): TargetLevel[] {
  return rows.map((r) => ({ unit: r.unit, value: r.value, exitPercent: r.exitPercent, lock: hasDistance(r.lock) ? ({ mode: r.lock, unit: r.marginUnit, value: r.marginValue } as TargetLock) : ({ mode: r.lock } as TargetLock) }));
}

const numberCls =
  "w-20 min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none [appearance:textfield] focus:border-brand-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const selectCls = "min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";

/**
 * A worked example so "margin" and "fixed" are not left abstract: % targets on a ₹100 entry (the numbers read
 * directly), points targets on the stock's latest price when known (points only mean something against a real price).
 */
function example(row: TargetRow, direction: "LONG" | "SHORT", latest: number | null): string | null {
  if (row.unit === "ATR_MULTIPLE" || row.unit === "R_MULTIPLE" || row.lock !== "FIXED" && row.lock !== "MARGIN" || (row.lock === "MARGIN" && row.marginUnit !== row.unit)) return null;
  const sign = direction === "SHORT" ? -1 : 1;
  const points = row.unit === "POINTS";
  const entry = points ? (latest ?? 1000) : 100;
  const tp = entry + sign * row.value;
  const floor = row.lock === "MARGIN" ? tp - sign * row.marginValue : tp;
  if (!(tp > 0) || !(floor > 0)) return null;
  const f = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
  const margin = row.lock === "MARGIN" ? ` (${row.marginValue}${points ? " points" : "%"} of margin)` : "";
  const bought = points && latest ? `bought at today's price ${f(entry)}` : `bought at ${f(entry)}`;
  return `Example: ${direction === "SHORT" ? bought.replace("bought", "sold short") : bought}, this target is ${f(tp)}${points ? ` (${row.value} points ${direction === "SHORT" ? "below" : "above"})` : ""}. It ${direction === "SHORT" ? "covers" : "sells"} ${row.exitPercent}% there; the rest is then closed if price ${direction === "SHORT" ? "rises back to" : "falls back to"} ${f(floor)}${margin}.`;
}

export default function StagedTargetsFields({
  rows,
  onChange,
  direction,
  singleTargetOn,
  latestPrice = null,
  onCapital = false,
}: {
  /** Distances are a share of capital / a ₹ amount rather than moves in the share's price. */
  onCapital?: boolean;
  rows: TargetRow[];
  onChange: (rows: TargetRow[]) => void;
  direction: "LONG" | "SHORT";
  singleTargetOn: boolean;
  /** The stock's latest price, for points examples. */
  latestPrice?: number | null;
}) {
  const levels = rowsToTargets(rows);
  const problem = rows.length ? validateTargets(levels, false) : null;
  const sold = rows.reduce((n, r) => n + (Number.isFinite(r.exitPercent) ? r.exitPercent : 0), 0);
  const set = (i: number, patch: Partial<TargetRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="mt-3 rounded-xl border border-brand-navy/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-navy">Take profit in stages (Target 1–3)</p>
          <p className="mt-0.5 text-xs text-brand-navy/40">
            Each target sells a share of the position when price reaches it, then <strong className="font-semibold">locks</strong> the profit on what is left. Replaces the single Target above.
          </p>
        </div>
        {rows.length < MAX_TARGETS && (
          <button
            type="button"
            onClick={() => {
              const last = rows[rows.length - 1];
              onChange([...rows, { unit: last?.unit ?? "PERCENT", value: last ? Math.round(last.value * 2 * 100) / 100 : 5, exitPercent: 25, lock: last?.lock ?? "FIXED", marginUnit: last?.marginUnit ?? "PERCENT", marginValue: last?.marginValue ?? 1 }]);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} /> Add target
          </button>
        )}
      </div>

      {rows.length > 0 && singleTargetOn && <p className="mt-2 text-xs font-medium text-brand-sell">Use either the single Target above or the staged targets, not both. Turn the single Target off.</p>}
      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg bg-brand-bg p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-16 text-sm font-semibold text-brand-navy">Target {i + 1}</span>
                <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                  Profit of
                  <input type="number" min={0} step="any" value={r.value} aria-label={`Target ${i + 1} distance`} onChange={(e) => set(i, { value: Number(e.target.value) })} className={numberCls} />
                  <select value={r.unit} aria-label={`Target ${i + 1} unit`} onChange={(e) => set(i, { unit: e.target.value as RiskUnit })} className={selectCls}>
                    {worded(UNITS, onCapital).map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                  Sell
                  <input type="number" min={1} max={100} step="any" value={r.exitPercent} aria-label={`Target ${i + 1} share to sell`} onChange={(e) => set(i, { exitPercent: Number(e.target.value) })} className={numberCls} />
                  % of the position
                </label>
                <button type="button" aria-label={`Remove target ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} className="ml-auto rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-16 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Then</span>
                <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                  the stop on the rest:
                  <select value={r.lock} aria-label={`Target ${i + 1} stop rule`} onChange={(e) => set(i, { lock: e.target.value as TargetLock["mode"] })} className={selectCls}>
                    {STOP_RULES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {hasDistance(r.lock) && (
                  <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                    {r.lock === "TRAIL" ? "Trail by" : "Distance"}
                    <input type="number" min={0} step="any" value={r.marginValue} aria-label={`Target ${i + 1} ${r.lock === "TRAIL" ? "trailing distance" : "margin"}`} onChange={(e) => set(i, { marginValue: Number(e.target.value) })} className={numberCls} />
                    <select value={r.marginUnit} aria-label={`Target ${i + 1} distance unit`} onChange={(e) => set(i, { marginUnit: e.target.value as RiskUnit })} className={selectCls}>
                      {worded(DISTANCE_UNITS, onCapital).map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="mt-1 text-[11px] text-brand-navy/45">{STOP_RULES.find((m) => m.value === r.lock)?.help}</p>
              {example(r, direction, latestPrice) && <p className="mt-2 text-xs text-brand-navy/50">{example(r, direction, latestPrice)}</p>}
            </div>
          ))}
          <p className="text-xs text-brand-navy/50">
            A moved stop only ever tightens, and (except &ldquo;Keep&rdquo; and &ldquo;Trail&rdquo;) is never worse than your entry price. A target in <strong className="font-semibold text-brand-navy/70">R</strong> is a multiple of the stop-loss distance (needs a stop-loss): 2R with a 2% stop is 4% away.
          </p>
          <p className={`text-xs ${sold > 100 ? "font-medium text-brand-sell" : "text-brand-navy/50"}`}>
            Sells {Math.round(sold * 100) / 100}% of the position across the targets{sold < 100 ? `; the other ${Math.round((100 - sold) * 100) / 100}% keeps running under your stop, trailing stop or exit rule.` : "."}
          </p>
          {problem ? <p className="text-xs font-medium text-brand-sell">{problem}</p> : <ul className="space-y-0.5 text-xs text-brand-navy/50">{describeTargets(levels).map((l) => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
