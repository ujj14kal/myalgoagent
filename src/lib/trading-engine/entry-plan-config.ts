import { MAX_ENTRY_LEVELS, validateEntryPlan, type EntryLevel, type EntryPlan, type RiskUnit } from "./step";

// A multi-level entry plan is stored as JSON on the strategy and copied onto each backtest and forward test, like the
// other risk settings. Reading it back is defensive: anything malformed is dropped rather than trusted.

const UNITS: RiskUnit[] = ["PERCENT", "POINTS", "ATR_MULTIPLE"];

export function parseEntryPlan(json: unknown): EntryPlan | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as { firstPercent?: unknown; levels?: unknown; maxHoldDays?: unknown };
  if (typeof o.firstPercent !== "number") return undefined;
  const levels: EntryLevel[] = [];
  if (Array.isArray(o.levels)) {
    for (const raw of o.levels.slice(0, MAX_ENTRY_LEVELS)) {
      const l = raw as Partial<EntryLevel>;
      if (!l || (l.trigger !== "PULLBACK" && l.trigger !== "BREAKOUT") || !UNITS.includes(l.unit as RiskUnit) || typeof l.value !== "number" || typeof l.allocationPercent !== "number") continue;
      levels.push({ trigger: l.trigger, unit: l.unit as RiskUnit, value: l.value, allocationPercent: l.allocationPercent, ...(typeof l.maxWaitDays === "number" ? { maxWaitDays: l.maxWaitDays } : {}) });
    }
  }
  return { firstPercent: o.firstPercent, levels, ...(typeof o.maxHoldDays === "number" ? { maxHoldDays: o.maxHoldDays } : {}) };
}

/** The entry plan to store for a strategy, or the reason it can't be (returned as data, never thrown across a Server Action). */
export function entryPlanToStore(input: EntryPlan | undefined, maxPyramidEntries: number): { json: EntryPlan | null; error?: string } {
  if (!input || (input.levels.length === 0 && input.maxHoldDays === undefined && input.firstPercent >= 100)) return { json: null };
  const error = validateEntryPlan(input, maxPyramidEntries);
  if (error) return { json: null, error };
  return { json: parseEntryPlan(input) ?? null };
}
