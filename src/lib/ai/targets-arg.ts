import { validateTargets, type TargetLevel } from "@/lib/trading-engine/step";
import type { RiskUnitName } from "./proposals";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The agent's `targets` argument → staged targets. Throws a readable error. Undefined when absent. */
export function targetsFrom(v: unknown): TargetLevel[] | undefined {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) throw new Error("targets: give a list of up to three targets.");
  const unitOf = (u: unknown, fallback: RiskUnitName): RiskUnitName => (u === "POINTS" || u === "ATR_MULTIPLE" || u === "PERCENT" ? u : fallback);
  const out = v.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const value = num(o.value);
    const exitPercent = num(o.exit_percent);
    if (!value || value <= 0) throw new Error(`targets[${i + 1}]: value must be above zero.`);
    if (!exitPercent) throw new Error(`targets[${i + 1}]: exit_percent is required (the share of the position to sell, 1–100).`);
    const unit = unitOf(o.unit, "PERCENT");
    const margin = String(o.lock ?? "fixed").toLowerCase() === "margin";
    const marginValue = num(o.margin_value);
    if (margin && (!marginValue || marginValue <= 0)) throw new Error(`targets[${i + 1}]: a margin lock needs margin_value above zero.`);
    return { unit, value, exitPercent, lock: margin ? { mode: "MARGIN" as const, unit: unitOf(o.margin_unit, unit), value: marginValue! } : { mode: "FIXED" as const } };
  });
  const problem = validateTargets(out);
  if (problem) throw new Error(`targets: ${problem}`);
  return out;
}
