import type { ConditionNode } from "@/lib/strategy/types";
import type { StrategyInput } from "@/lib/strategy-write";
import type { WorkspaceDefinition } from "./types";

/** A published version as the ordinary strategy it compiles to. */
export function strategyInputFor(def: WorkspaceDefinition, entry: ConditionNode, exit: ConditionNode, name: string): StrategyInput {
  return {
    name,
    instrumentId: def.instrumentId,
    mode: "NO_CODE",
    direction: def.direction,
    entryCondition: entry,
    exitCondition: exit,
    positionSizingMode: def.positionSizingMode,
    positionSizingValue: def.positionSizingValue,
    stopLoss: def.stopLoss,
    target: def.target,
    trailingSl: def.trailingSl,
    ...(def.targets?.length ? { targets: def.targets } : {}),
    ...(def.style ? { style: def.style } : {}),
    ...(def.entryPlan ? { entryPlan: def.entryPlan } : {}),
    maxPyramidEntries: def.maxPyramidEntries,
    timeframe: def.timeframe,
    noEntryAfterMinute: def.noEntryAfterMinute ?? null,
    squareOffMinute: def.squareOffMinute ?? null,
    productType: def.productType ?? (def.timeframe === "1d" ? "DELIVERY" : "INTRADAY"),
    orderType: def.orderType ?? "MARKET",
    limitMode: def.orderType === "LIMIT" ? def.limitMode ?? "PERCENT" : null,
    limitValue: def.orderType === "LIMIT" ? def.limitValue ?? null : null,
  };
}

