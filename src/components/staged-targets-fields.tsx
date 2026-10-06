"use client";

import { Plus, Trash2 } from "lucide-react";
import { MAX_TARGETS, validateTargets, type RiskUnit, type TargetLevel } from "@/lib/trading-engine/step";
import { describeTargets } from "@/lib/describe-targets";

// Target 1–3: sell part of the position at each target and lock profit on the rest.

export interface TargetRow {
  unit: RiskUnit;
  value: number;
  exitPercent: number;
  lock: "FIXED" | "MARGIN";
  marginUnit: RiskUnit;
  marginValue: number;
}

const UNITS: { value: RiskUnit; label: string }[] = [
  { value: "PERCENT", label: "%" },
  { value: "POINTS", label: "Points" },
  { value: "ATR_MULTIPLE", label: "× ATR(14)" },
];

export function targetsToRows(levels: TargetLevel[] | undefined): TargetRow[] {
  return (levels ?? []).map((t) => ({
    unit: t.unit,
    value: t.value,
    exitPercent: t.exitPercent,
    lock: t.lock.mode,
    marginUnit: t.lock.mode === "MARGIN" ? t.lock.unit : t.unit,
    marginValue: t.lock.mode === "MARGIN" ? t.lock.value : 1,
  }));
}

export function rowsToTargets(rows: TargetRow[]): TargetLevel[] {
  return rows.map((r) => ({ unit: r.unit, value: r.value, exitPercent: r.exitPercent, lock: r.lock === "MARGIN" ? { mode: "MARGIN", unit: r.marginUnit, value: r.marginValue } : { mode: "FIXED" } }));
}

const numberCls =
  "w-20 min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none [appearance:textfield] focus:border-brand-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const selectCls = "min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";

/**
 * A worked example so "margin" and "fixed" are not left abstract: % targets on a ₹100 entry (the numbers read
 * directly), points targets on the stock's latest price when known (points only mean something against a real price).
 */
function example(row: TargetRow, direction: "LONG" | "SHORT", latest: number | null): string | null {
  if (row.unit === "ATR_MULTIPLE" || (row.lock === "MARGIN" && row.marginUnit !== row.unit)) return null;
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
}: {
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
                    {UNITS.map((u) => (
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
                <span className="w-16 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Lock</span>
                <div className="flex overflow-hidden rounded-full border border-brand-navy/15 text-xs" role="radiogroup" aria-label={`Target ${i + 1} lock`}>
                  {(["FIXED", "MARGIN"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={r.lock === m}
                      onClick={() => set(i, { lock: m })}
                      title={m === "FIXED" ? "The rest is sold if price falls back to this target's own price." : "The lock sits a margin below the target, so price can pull back a little before the rest is sold."}
                      className={`px-3 py-1 font-medium ${r.lock === m ? "bg-brand-primary text-white" : "bg-white text-brand-navy/60 hover:bg-brand-bg"}`}
                    >
                      {m === "FIXED" ? "Fixed" : "With margin"}
                    </button>
                  ))}
                </div>
                {r.lock === "MARGIN" && (
                  <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                    Margin
                    <input type="number" min={0} step="any" value={r.marginValue} aria-label={`Target ${i + 1} margin`} onChange={(e) => set(i, { marginValue: Number(e.target.value) })} className={numberCls} />
                    <select value={r.marginUnit} aria-label={`Target ${i + 1} margin unit`} onChange={(e) => set(i, { marginUnit: e.target.value as RiskUnit })} className={selectCls}>
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {example(r, direction, latestPrice) && <p className="mt-2 text-xs text-brand-navy/50">{example(r, direction, latestPrice)}</p>}
            </div>
          ))}
          <p className="text-xs text-brand-navy/50">
            <strong className="font-semibold text-brand-navy/70">Fixed:</strong> after a target is taken, the rest is sold if price falls back to that target&apos;s own price.{" "}
            <strong className="font-semibold text-brand-navy/70">With margin:</strong> the lock sits that margin below the target (above, for a short), so price can pull back a little without giving up the lock. A lock is never worse than your entry price.
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
