import type { Candle } from "@/lib/market-data";
import type { EntryPlan } from "@/lib/trading-engine/step";
import { conditionTruthPerBar } from "./evaluate";
import type { AuxCandleMap } from "./evaluate";
import type { ConditionNode } from "./types";

// Entry-plan levels triggered by a rule ("buy more when RSI is back above 40") need their rule judged on every candle,
// with the same multi-timeframe and cross-instrument data as the entry and exit rules.

/** The exit rule joined with every level rule, used only to work out which extra candle series to fetch. */
export function withLevelConditions(exit: ConditionNode, plan: EntryPlan | null | undefined): ConditionNode {
  const rules = (plan?.levels ?? []).flatMap((l) => (l.trigger === "SIGNAL" && l.condition ? [l.condition] : []));
  return rules.length === 0 ? exit : { kind: "group", op: "OR", children: [exit, ...rules] };
}

/** For each plan level, whether its rule held at the close of each candle; undefined for price-triggered levels. */
export function levelSignalSeries(candles: Candle[], plan: EntryPlan | null | undefined, aux: AuxCandleMap): (boolean[] | undefined)[] | undefined {
  if (!plan || !plan.levels.some((l) => l.trigger === "SIGNAL" && l.condition)) return undefined;
  return plan.levels.map((l) => (l.trigger === "SIGNAL" && l.condition ? conditionTruthPerBar(candles, l.condition, aux) : undefined));
}
