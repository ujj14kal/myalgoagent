import type { RiskUnit, TargetLevel } from "@/lib/trading-engine/step";

const unitText = (unit: RiskUnit, value: number) => (unit === "PERCENT" ? `${value}%` : unit === "POINTS" ? `${value} pts` : `${value}× ATR`);

/** One plain line per staged target, e.g. "Target 1: +5% — sells 25% of the position, then locks the rest at that price". */
export function describeTargets(targets: TargetLevel[]): string[] {
  return targets.map((t, i) => {
    const lock = t.lock.mode === "MARGIN" ? `locks the rest ${unitText(t.lock.unit, t.lock.value)} below it` : "locks the rest at that price";
    return `Target ${i + 1}: ${unitText(t.unit, t.value)} from entry — sells ${t.exitPercent}% of the position, then ${lock}`;
  });
}
