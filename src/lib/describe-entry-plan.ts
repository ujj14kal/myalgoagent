import type { EntryPlan, RiskUnit } from "@/lib/trading-engine/step";

const unitText = (unit: RiskUnit, value: number) => (unit === "PERCENT" ? `${value}%` : unit === "POINTS" ? `${value} pts` : `${value}× ATR`);

/** One plain line per entry of a multi-level plan, and one for the holding limit. */
export function describeEntryPlan(plan: EntryPlan, direction: "LONG" | "SHORT" = "LONG"): string[] {
  const verb = direction === "SHORT" ? "sells short" : "buys";
  const lines = [`Entry 1: when the entry rule fires, ${verb} ${plan.firstPercent}% of the planned size`];
  plan.levels.forEach((l, i) => {
    const moves = (l.trigger === "PULLBACK") === (direction !== "SHORT") ? "falls" : "rises";
    const wait = l.maxWaitDays ? `, withdrawn after ${l.maxWaitDays} day${l.maxWaitDays === 1 ? "" : "s"}` : "";
    lines.push(`Entry ${i + 2}: when price ${moves} ${unitText(l.unit, l.value)} from the first fill, ${verb} ${l.allocationPercent}% of the planned size${wait}`);
  });
  if (plan.maxHoldDays) lines.push(`Closes at the open ${plan.maxHoldDays} trading day${plan.maxHoldDays === 1 ? "" : "s"} after the first entry if still open`);
  return lines;
}
