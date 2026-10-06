import type { RiskUnit, TargetLevel, TargetLock } from "@/lib/trading-engine/step";

export const unitText = (unit: RiskUnit, value: number) => (unit === "PERCENT" ? `${value}%` : unit === "POINTS" ? `${value} pts` : unit === "R_MULTIPLE" ? `${value}R` : `${value}× ATR`);

/** What a target does to the stop on the rest of the position, in words. */
export function lockText(lock: TargetLock): string {
  switch (lock.mode) {
    case "MARGIN":
      return `moves the stop to ${unitText(lock.unit, lock.value)} short of it`;
    case "BREAKEVEN":
      return "moves the stop to the entry price (breakeven)";
    case "PREVIOUS":
      return "moves the stop to the previous target's price (breakeven after Target 1)";
    case "KEEP":
      return "leaves the stop where it was";
    case "TRAIL":
      return `then trails the stop ${unitText(lock.unit, lock.value)} behind the best price`;
    default:
      return "locks the rest at that price";
  }
}

/** One plain line per staged target, e.g. "Target 1: +5% — sells 25% of the position, then locks the rest at that price". */
export function describeTargets(targets: TargetLevel[]): string[] {
  return targets.map((t, i) => `Target ${i + 1}: ${unitText(t.unit, t.value)} from entry${t.unit === "R_MULTIPLE" ? " (a multiple of the stop-loss distance)" : ""} — sells ${t.exitPercent}% of the position, then ${lockText(t.lock)}`);
}
