"use client";

import { Plus, Trash2 } from "lucide-react";
import { MAX_ENTRY_LEVELS, validateEntryPlan, type EntryPlan, type RiskUnit } from "@/lib/trading-engine/step";
import { describeEntryPlan } from "@/lib/describe-entry-plan";
import { parseDsl } from "@/lib/strategy/dsl";
import { conditionToText } from "@/lib/strategy/format";
import type { ConditionNode } from "@/lib/strategy/types";

// A multi-level entry plan: the entry rule buys a first share, each further level buys more as price reaches it
// (or as a rule holds), and an optional holding limit closes the position after some days.

export interface LevelRow {
  trigger: "PULLBACK" | "BREAKOUT" | "SIGNAL";
  unit: RiskUnit;
  value: number;
  allocation: number;
  maxWait: number | null;
  /** SIGNAL levels: the rule in the strategy language, e.g. "rsi(14) > 40". */
  rule: string;
  /** The rule as saved, kept while its text is unchanged (it may use things the text form can't express). */
  ruleNode?: ConditionNode;
  ruleText0?: string;
}

export interface PlanState {
  enabled: boolean;
  firstPercent: number;
  maxHoldDays: number | null;
  levels: LevelRow[];
}

export const EMPTY_PLAN: PlanState = { enabled: false, firstPercent: 50, maxHoldDays: null, levels: [] };

export function planToState(plan: EntryPlan | null | undefined): PlanState {
  if (!plan) return EMPTY_PLAN;
  return {
    enabled: true,
    firstPercent: plan.firstPercent,
    maxHoldDays: plan.maxHoldDays ?? null,
    levels: plan.levels.map((l) => {
      const text = l.condition ? conditionToText(l.condition) : "";
      return { trigger: l.trigger, unit: l.unit, value: l.value, allocation: l.allocationPercent, maxWait: l.maxWaitDays ?? null, rule: text, ruleNode: l.condition, ruleText0: text };
    }),
  };
}

/** The plan to save, or why the form can't be saved yet. Nothing when the plan is switched off. */
export function stateToPlan(s: PlanState): { plan?: EntryPlan; error?: string } {
  if (!s.enabled) return {};
  const levels: EntryPlan["levels"] = [];
  for (const [i, l] of s.levels.entries()) {
    let condition: ConditionNode | undefined;
    if (l.trigger === "SIGNAL") {
      if (l.ruleNode && l.rule === l.ruleText0) condition = l.ruleNode;
      else {
        try {
          condition = parseDsl(l.rule);
        } catch (err) {
          return { error: `Entry ${i + 2}: ${err instanceof Error ? err.message : "that rule isn't valid"}` };
        }
      }
    }
    levels.push({ trigger: l.trigger, unit: l.unit, value: l.trigger === "SIGNAL" ? 0 : l.value, allocationPercent: l.allocation, ...(condition ? { condition } : {}), ...(l.maxWait ? { maxWaitDays: l.maxWait } : {}) });
  }
  const plan: EntryPlan = { firstPercent: s.firstPercent, levels, ...(s.maxHoldDays ? { maxHoldDays: s.maxHoldDays } : {}) };
  return { plan };
}

const UNITS: { value: RiskUnit; label: string }[] = [
  { value: "PERCENT", label: "%" },
  { value: "POINTS", label: "Points" },
  { value: "ATR_MULTIPLE", label: "× ATR(14)" },
];
const numberCls =
  "w-20 min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none [appearance:textfield] focus:border-brand-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const selectCls = "min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";

export default function EntryPlanFields({
  state,
  onChange,
  direction,
  pyramiding,
}: {
  state: PlanState;
  onChange: (s: PlanState) => void;
  direction: "LONG" | "SHORT";
  /** Max entries per position above 1: can't be combined with a plan. */
  pyramiding: boolean;
}) {
  const set = (patch: Partial<PlanState>) => onChange({ ...state, ...patch });
  const setLevel = (i: number, patch: Partial<LevelRow>) => set({ levels: state.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const total = state.firstPercent + state.levels.reduce((n, l) => n + (Number.isFinite(l.allocation) ? l.allocation : 0), 0);
  const parsed = stateToPlan(state);
  const problem = parsed.error ?? (parsed.plan ? validateEntryPlan(parsed.plan, pyramiding ? 2 : 1) : null);
  const verb = direction === "SHORT" ? "sell short" : "buy";
  const moves = (t: LevelRow["trigger"]) => ((t === "PULLBACK") === (direction !== "SHORT") ? "falls" : "rises");

  return (
    <div className="rounded-xl border border-brand-navy/10 p-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 accent-brand-primary" checked={state.enabled} onChange={(e) => set({ enabled: e.target.checked, levels: e.target.checked && state.levels.length === 0 ? [{ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocation: 50, maxWait: null, rule: "" }] : state.levels })} />
        <span>
          <span className="text-sm font-medium text-brand-navy">Build the position in stages (entry plan)</span>
          <span className="mt-0.5 block text-xs text-brand-navy/40">
            The entry rule {verb}s only a first share of the planned size. Each further entry adds more when price reaches a level, or when a rule holds. The planned size comes from the position size above.
          </span>
        </span>
      </label>

      {state.enabled && (
        <div className="mt-3 space-y-3">
          {pyramiding && <p className="text-xs font-medium text-brand-sell">An entry plan can&apos;t be combined with &ldquo;Max entries per position&rdquo; above 1. Set that back to 1.</p>}
          <div className="rounded-lg bg-brand-bg p-3">
            <label className="flex flex-wrap items-center gap-2 text-sm text-brand-navy">
              <span className="w-16 font-semibold">Entry 1</span>
              <span className="text-xs text-brand-navy/60">When the entry rule fires, {verb}</span>
              <input type="number" min={1} max={100} step="any" value={state.firstPercent} aria-label="Share of the planned size at the first entry" onChange={(e) => set({ firstPercent: Number(e.target.value) })} className={numberCls} />
              <span className="text-xs text-brand-navy/60">% of the planned size</span>
            </label>
          </div>

          {state.levels.map((l, i) => (
            <div key={i} className="rounded-lg bg-brand-bg p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-16 text-sm font-semibold text-brand-navy">Entry {i + 2}</span>
                <select value={l.trigger} aria-label={`Entry ${i + 2} trigger`} onChange={(e) => setLevel(i, { trigger: e.target.value as LevelRow["trigger"] })} className={selectCls}>
                  <option value="PULLBACK">{direction === "SHORT" ? "When price rises (average up)" : "When price falls (average down)"}</option>
                  <option value="BREAKOUT">{direction === "SHORT" ? "When price falls further (add on weakness)" : "When price rises (add on strength)"}</option>
                  <option value="SIGNAL">When a rule holds</option>
                </select>
                {l.trigger !== "SIGNAL" && (
                  <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                    by
                    <input type="number" min={0} step="any" value={l.value} aria-label={`Entry ${i + 2} distance`} onChange={(e) => setLevel(i, { value: Number(e.target.value) })} className={numberCls} />
                    <select value={l.unit} aria-label={`Entry ${i + 2} unit`} onChange={(e) => setLevel(i, { unit: e.target.value as RiskUnit })} className={selectCls}>
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    from the first fill
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
                  {verb}
                  <input type="number" min={1} max={100} step="any" value={l.allocation} aria-label={`Entry ${i + 2} share of the planned size`} onChange={(e) => setLevel(i, { allocation: Number(e.target.value) })} className={numberCls} />% of the plan
                </label>
                <button type="button" aria-label={`Remove entry ${i + 2}`} onClick={() => set({ levels: state.levels.filter((_, j) => j !== i) })} className="ml-auto rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell">
                  <Trash2 size={14} />
                </button>
              </div>
              {l.trigger === "SIGNAL" && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={l.rule}
                    aria-label={`Entry ${i + 2} rule`}
                    placeholder="e.g. rsi(14) > 40   or   close crossesAbove sma(20)"
                    onChange={(e) => setLevel(i, { rule: e.target.value })}
                    className="w-full rounded-lg border border-brand-navy/15 px-3 py-1.5 font-mono text-[13px] outline-none focus:border-brand-primary"
                  />
                  <p className="mt-1 text-xs text-brand-navy/40">Checked at each candle&apos;s close; the buy happens at the next open, never on the same candle. Same rule language as &ldquo;Write code&rdquo;.</p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="accent-brand-primary" checked={l.maxWait !== null} onChange={(e) => setLevel(i, { maxWait: e.target.checked ? 20 : null })} />
                  Drop this entry if it hasn&apos;t happened within
                </label>
                {l.maxWait !== null && (
                  <>
                    <input type="number" min={1} step={1} value={l.maxWait} aria-label={`Entry ${i + 2} waiting days`} onChange={(e) => setLevel(i, { maxWait: Math.max(1, Math.floor(Number(e.target.value))) })} className={numberCls} />
                    trading days of the first entry
                  </>
                )}
              </div>
              {l.trigger !== "SIGNAL" && <p className="mt-1.5 text-xs text-brand-navy/40">Waits at the level; fills when price {moves(l.trigger)} that far from the first fill, at the level or the open if it gaps.</p>}
            </div>
          ))}

          {state.levels.length < MAX_ENTRY_LEVELS && (
            <button
              type="button"
              onClick={() => {
                const last = state.levels[state.levels.length - 1];
                set({ levels: [...state.levels, { trigger: last?.trigger ?? "PULLBACK", unit: last?.unit ?? "PERCENT", value: last ? Math.round(last.value * 2 * 100) / 100 : 3, allocation: last?.allocation ?? 25, maxWait: last?.maxWait ?? null, rule: "" }] });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
            >
              <Plus size={13} /> Add an entry
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="accent-brand-primary" checked={state.maxHoldDays !== null} onChange={(e) => set({ maxHoldDays: e.target.checked ? 60 : null })} />
              Close the position at the open
            </label>
            {state.maxHoldDays !== null && (
              <>
                <input type="number" min={1} step={1} value={state.maxHoldDays} aria-label="Maximum holding days" onChange={(e) => set({ maxHoldDays: Math.max(1, Math.floor(Number(e.target.value))) })} className={numberCls} />
                trading days after the first entry, if it is still open
              </>
            )}
          </div>

          <p className={`text-xs ${total > 100.0001 ? "font-medium text-brand-sell" : "text-brand-navy/50"}`}>The entries together buy {Math.round(total * 100) / 100}% of the planned size{total < 100 ? ` (the other ${Math.round((100 - total) * 100) / 100}% is never bought)` : ""}.</p>
          {problem ? <p className="text-xs font-medium text-brand-sell">{problem}</p> : parsed.plan && <ul className="space-y-0.5 text-xs text-brand-navy/50">{describeEntryPlan(parsed.plan, direction).map((line) => <li key={line}>{line}</li>)}</ul>}
          <p className="text-xs text-brand-navy/40">Stops and targets are measured from your average entry. Buying more as price falls puts more money into a position that is losing; if it keeps falling, the loss is larger than with a single entry.</p>
        </div>
      )}
    </div>
  );
}
