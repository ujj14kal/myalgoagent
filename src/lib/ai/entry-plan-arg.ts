import { validateEntryPlan, type EntryLevel, type EntryPlan } from "@/lib/trading-engine/step";
import { parseStyle, type StrategyStyle } from "@/lib/strategy/style";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const unitOf = (u: unknown): "PERCENT" | "POINTS" | "ATR_MULTIPLE" => (u === "POINTS" || u === "ATR_MULTIPLE" ? u : "PERCENT");

/** The agent's `entry_plan` argument → an entry plan. Throws a readable error. Undefined when absent; null removes it. */
export function entryPlanFrom(v: unknown, maxPyramidEntries = 1): EntryPlan | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("entry_plan: give an object with first_percent and a list of levels.");
  const o = v as Record<string, unknown>;
  const rawLevels = o.levels === undefined ? [] : o.levels;
  if (!Array.isArray(rawLevels)) throw new Error("entry_plan.levels: give a list of further entries.");
  const levels: EntryLevel[] = rawLevels.map((raw, i) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const value = num(l.value);
    const allocation = num(l.allocation_percent);
    const trigger = String(l.trigger ?? "pullback").toLowerCase();
    if (trigger !== "pullback" && trigger !== "breakout") throw new Error(`entry_plan.levels[${i + 1}]: trigger must be "pullback" or "breakout".`);
    if (!value || value <= 0) throw new Error(`entry_plan.levels[${i + 1}]: value must be above zero.`);
    if (!allocation) throw new Error(`entry_plan.levels[${i + 1}]: allocation_percent is required (the share of the planned size to buy there, 1–100).`);
    const wait = num(l.max_wait_days);
    return { trigger: trigger === "breakout" ? "BREAKOUT" : "PULLBACK", unit: unitOf(l.unit), value, allocationPercent: allocation, ...(wait ? { maxWaitDays: Math.floor(wait) } : {}) };
  });
  const first = num(o.first_percent) ?? Math.max(1, 100 - levels.reduce((n, l) => n + l.allocationPercent, 0));
  const hold = num(o.max_hold_days);
  const plan: EntryPlan = { firstPercent: first, levels, ...(hold ? { maxHoldDays: Math.floor(hold) } : {}) };
  const problem = validateEntryPlan(plan, maxPyramidEntries);
  if (problem) throw new Error(`entry_plan: ${problem}`);
  return plan;
}

/** The agent's `style` argument. Undefined when absent. */
export function styleFrom(v: unknown): StrategyStyle | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = parseStyle(String(v).toUpperCase().replace(/[^A-Z]/g, ""));
  if (!s) throw new Error('style: use "intraday", "swing" or "positional".');
  return s;
}
