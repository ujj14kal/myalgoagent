import { validateTargets, type TargetLevel } from "@/lib/trading-engine/step";
import type { RiskUnitName } from "./proposals";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The agent's `targets` argument → staged targets. Throws a readable error. Undefined when absent. */
export function targetsFrom(v: unknown): TargetLevel[] | undefined {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) throw new Error("targets: give a list of up to three targets.");
  const unitOf = (u: unknown, fallback: RiskUnitName): RiskUnitName => (u === "POINTS" || u === "ATR_MULTIPLE" || u === "PERCENT" || u === "R_MULTIPLE" ? u : fallback);
  const out = v.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const value = num(o.value);
    const exitPercent = num(o.exit_percent);
    if (!value || value <= 0) throw new Error(`targets[${i + 1}]: value must be above zero.`);
    if (!exitPercent) throw new Error(`targets[${i + 1}]: exit_percent is required (the share of the position to sell, 1–100).`);
    const unit = unitOf(o.unit, "PERCENT");
    // What the stop on the rest does after this target: fixed (move to this target), breakeven, previous (previous
    // target), keep, trail (trail by margin_value) or margin (a set distance short of this target).
    const rule = String(o.lock ?? "fixed").toLowerCase();
    const distanceUnit = unitOf(o.margin_unit, unit === "R_MULTIPLE" ? "PERCENT" : unit);
    if (rule === "margin" || rule === "trail") {
      const marginValue = num(o.margin_value);
      if (!marginValue || marginValue <= 0) throw new Error(`targets[${i + 1}]: a "${rule}" stop rule needs margin_value above zero (${rule === "trail" ? "how far the stop trails the best price" : "how far short of the target the stop sits"}).`);
      return { unit, value, exitPercent, lock: { mode: rule === "trail" ? ("TRAIL" as const) : ("MARGIN" as const), unit: distanceUnit, value: marginValue } };
    }
    const mode = rule === "breakeven" ? ("BREAKEVEN" as const) : rule === "previous" ? ("PREVIOUS" as const) : rule === "keep" ? ("KEEP" as const) : ("FIXED" as const);
    return { unit, value, exitPercent, lock: { mode } };
  });
  const problem = validateTargets(out);
  if (problem) throw new Error(`targets: ${problem}`);
  return out;
}
