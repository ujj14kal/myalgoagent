import type { Candle } from "@/lib/market-data";
import { evaluateConditionLevels, type AuxCandleMap } from "@/lib/strategy/evaluate";
import type { ConditionNode } from "@/lib/strategy/types";
import { systemSignals, type SystemRules, type SystemSignals } from "@/lib/trading-engine/system-step";
import type { SystemRuntime } from "./types";

/** Every rule a system reads (concepts and their optional blocks) as one tree — what decides which other charts to fetch. */
export function systemConditions(rt: SystemRuntime): ConditionNode {
  const all = rt.concepts.flatMap((c) => [c.condition, ...c.optionals]);
  return all.length === 1 ? all[0] : { kind: "group", op: "OR", children: all };
}

/** Each candle's system signals: concepts evaluated (with their optional blocks) and combined per side. */
export function systemSignalSeries(candles: Candle[], rt: SystemRuntime, aux: AuxCandleMap): SystemSignals[] {
  const conds = rt.concepts.flatMap((c) => [c.condition, ...c.optionals]);
  const levels = evaluateConditionLevels(candles, conds, aux);
  let k = 0;
  const concepts = rt.concepts.map((c) => {
    const valid = levels[k++];
    const optionals = c.optionals.map(() => levels[k++]);
    return { side: c.side, valid, optionals, timeframeRank: c.timeframeRank, entry: c.entry, role: c.role };
  });
  return systemSignals(concepts, candles.length);
}

export const systemRules = (rt: SystemRuntime): SystemRules => ({ conflict: rt.conflict, opposite: rt.opposite, allowShort: rt.allowShort, entryWindows: rt.entryWindows, noTradeWindows: rt.noTradeWindows });

/** Reads a stored runtime defensively: anything malformed means "not a system". */
export function parseSystemRuntime(json: unknown): SystemRuntime | null {
  const o = json as SystemRuntime | null;
  if (!o || typeof o !== "object" || o.schema !== 1 || !Array.isArray(o.concepts) || !o.conflict || !o.opposite) return null;
  return { ...o, entryWindows: Array.isArray(o.entryWindows) ? o.entryWindows : [], noTradeWindows: Array.isArray(o.noTradeWindows) ? o.noTradeWindows : [] };
}
