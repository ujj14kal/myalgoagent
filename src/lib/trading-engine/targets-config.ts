import { MAX_TARGETS, validateTargets, type RiskUnit, type TargetLevel } from "./step";

// Staged targets are stored as JSON on the strategy and copied onto each backtest and forward test, like the
// other risk settings. Reading them back is defensive: anything malformed is dropped rather than trusted.

const UNITS: RiskUnit[] = ["PERCENT", "POINTS", "ATR_MULTIPLE"];
const isUnit = (u: unknown): u is RiskUnit => UNITS.includes(u as RiskUnit);

export function parseTargets(json: unknown): TargetLevel[] {
  if (!Array.isArray(json)) return [];
  const out: TargetLevel[] = [];
  for (const raw of json.slice(0, MAX_TARGETS)) {
    const t = raw as Partial<TargetLevel> & { lock?: { mode?: string; unit?: unknown; value?: unknown } };
    if (!t || !isUnit(t.unit) || typeof t.value !== "number" || typeof t.exitPercent !== "number") continue;
    const lock = t.lock?.mode === "MARGIN" && isUnit(t.lock.unit) && typeof t.lock.value === "number" ? ({ mode: "MARGIN", unit: t.lock.unit, value: t.lock.value } as const) : ({ mode: "FIXED" } as const);
    out.push({ unit: t.unit, value: t.value, exitPercent: t.exitPercent, lock });
  }
  return out;
}

/** The staged targets to store for a strategy, or the reason they can't be (returned as data, never thrown across a Server Action). */
export function targetsToStore(input: TargetLevel[] | undefined, singleTargetOn: boolean): { json: TargetLevel[] | null; error?: string } {
  if (!input || input.length === 0) return { json: null };
  const error = validateTargets(input, singleTargetOn);
  if (error) return { json: null, error };
  return { json: parseTargets(input) };
}
