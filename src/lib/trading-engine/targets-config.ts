import { MAX_TARGETS, validateTargets, type RiskUnit, type TargetLevel, type TargetLock } from "./step";

// Staged targets are stored as JSON on the strategy and copied onto each backtest and forward test, like the
// other risk settings. Reading them back is defensive: anything malformed is dropped rather than trusted.

const UNITS: RiskUnit[] = ["PERCENT", "POINTS", "ATR_MULTIPLE", "R_MULTIPLE"];
const isUnit = (u: unknown): u is RiskUnit => UNITS.includes(u as RiskUnit);

/** A stored stop rule; anything unknown is the original behaviour (lock at the target's price). */
function lockOf(l: { mode?: string; unit?: unknown; value?: unknown } | undefined): TargetLock {
  switch (l?.mode) {
    case "MARGIN":
    case "TRAIL":
      return isUnit(l.unit) && typeof l.value === "number" ? { mode: l.mode, unit: l.unit, value: l.value } : { mode: "FIXED" };
    case "BREAKEVEN":
    case "PREVIOUS":
    case "KEEP":
      return { mode: l.mode };
    default:
      return { mode: "FIXED" };
  }
}

export function parseTargets(json: unknown): TargetLevel[] {
  if (!Array.isArray(json)) return [];
  const out: TargetLevel[] = [];
  for (const raw of json.slice(0, MAX_TARGETS)) {
    const t = raw as Partial<TargetLevel> & { lock?: { mode?: string; unit?: unknown; value?: unknown } };
    if (!t || !isUnit(t.unit) || typeof t.value !== "number" || typeof t.exitPercent !== "number") continue;
    out.push({ unit: t.unit, value: t.value, exitPercent: t.exitPercent, lock: lockOf(t.lock) });
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
