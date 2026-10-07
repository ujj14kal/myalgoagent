import type { RiskLegInput } from "@/lib/trading-engine/step";
import { validateConditionNode } from "@/lib/strategy/validate";
import { parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import { parseTargets } from "@/lib/trading-engine/targets-config";
import { DEFAULT_RISK_OPTIONS, parseRiskOptions } from "@/lib/trading-engine/risk-options";
import { CONNECTIONS } from "@/lib/workspace/types";
import { CONCEPT_CLASSES, CONFLICT_RULES, TIMEFRAME_ROLES, type BlockDefinition, type ConceptClass, type ConceptDefinition, type ConceptNode, type OppositeAction, type TimeframeRole, type TradingSystemDefinition } from "./types";

// Blocks, concepts and trading systems are stored as JSON. Reading them back is defensive and bounded: anything
// malformed is dropped or repaired rather than trusted, and nothing can grow without limit.

export const SYSTEM_LIMITS = { conceptNodes: 60, depth: 5, concepts: 20, windows: 8, bytes: 100_000 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const tooBig = (v: unknown) => JSON.stringify(v).length > SYSTEM_LIMITS.bytes;

/** True when any operand of the rule reads another instrument's chart. */
export function namesInstrument(node: unknown): boolean {
  return JSON.stringify(node).includes('"instrumentSymbol"');
}

/** A block: one rule, nothing else — no instrument. Null when it isn't a valid rule. */
export function parseBlockDefinition(json: unknown): BlockDefinition | null {
  if (!isObj(json) || json.schema !== 1 || tooBig(json) || namesInstrument(json.condition)) return null;
  try {
    validateConditionNode(json.condition);
  } catch {
    return null;
  }
  return { schema: 1, condition: json.condition as BlockDefinition["condition"] };
}

function parseConceptNode(v: unknown, depth: number, budget: { n: number }): ConceptNode | null {
  if (!isObj(v) || depth > SYSTEM_LIMITS.depth || ++budget.n > SYSTEM_LIMITS.conceptNodes) return null;
  if (v.type === "block") {
    if (typeof v.blockId !== "string" || !v.blockId) return null;
    const timeframe = TIMEFRAME_ROLES.includes(v.timeframe as TimeframeRole) ? (v.timeframe as TimeframeRole) : undefined;
    return { type: "block", blockId: v.blockId.slice(0, 40), ...(v.optional === true ? { optional: true } : {}), ...(timeframe && timeframe !== "primary" ? { timeframe } : {}) };
  }
  if (v.type === "group") {
    if (!CONNECTIONS.includes(v.connection as never)) return null;
    const children = (Array.isArray(v.children) ? v.children : []).map((c) => parseConceptNode(c, depth + 1, budget)).filter((c): c is ConceptNode => c !== null);
    const bars = num(v.bars);
    return { type: "group", connection: v.connection as never, ...(bars !== null ? { bars: Math.floor(bars) } : {}), children };
  }
  return null;
}

export function parseConceptDefinition(json: unknown): ConceptDefinition | null {
  if (!isObj(json) || json.schema !== 1 || tooBig(json)) return null;
  return { schema: 1, logic: json.logic == null ? null : parseConceptNode(json.logic, 0, { n: 0 }) };
}

export const parseConceptClass = (v: unknown): ConceptClass => (CONCEPT_CLASSES.includes(v as ConceptClass) ? (v as ConceptClass) : "BULLISH");

/** Every block a concept's logic refers to. */
export function conceptBlockIds(node: ConceptNode | null): string[] {
  if (!node) return [];
  if (node.type === "block") return [node.blockId];
  return [...new Set(node.children.flatMap(conceptBlockIds))];
}

export function emptySystem(instrumentId = ""): TradingSystemDefinition {
  return {
    schema: 2,
    concepts: [],
    instrumentType: "STOCK",
    instrumentId,
    timeframes: { primary: "15m", confirmation: null, higher: null },
    productType: "INTRADAY",
    sessions: { noEntryAfterMinute: 14 * 60 + 45, squareOffMinute: 15 * 60 + 15, entryWindows: [], noTradeWindows: [] },
    capital: { total: 100_000, maxUtilizationPercent: 100 },
    positionSizingMode: "RISK_PERCENT",
    positionSizingValue: 1,
    riskOptions: DEFAULT_RISK_OPTIONS,
    stopLoss: { enabled: true, unit: "PERCENT", value: 1 },
    target: { enabled: true, unit: "R_MULTIPLE", value: 2 },
    trailingSl: { enabled: false, unit: "PERCENT", value: 1 },
    targets: [],
    entryPlan: null,
    maxPyramidEntries: 1,
    conflict: { rule: "IGNORE", confirmBars: 2 },
    opposite: { whenLong: "EXIT", whenShort: "EXIT", confirmBars: 0 },
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
  };
}

const leg = (v: unknown, fallback: RiskLegInput): RiskLegInput => {
  if (!isObj(v)) return fallback;
  const unit = v.unit === "POINTS" || v.unit === "ATR_MULTIPLE" || v.unit === "R_MULTIPLE" ? v.unit : "PERCENT";
  return { enabled: v.enabled === true, unit, value: num(v.value) ?? fallback.value } as RiskLegInput;
};
const windows = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .filter((w): w is Record<string, unknown> => isObj(w) && num(w.startMinute) !== null && num(w.endMinute) !== null)
    .slice(0, SYSTEM_LIMITS.windows)
    .map((w) => ({ startMinute: Math.floor(w.startMinute as number), endMinute: Math.floor(w.endMinute as number) }));
const tfOrNull = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 8) : null);
const OPPOSITE: OppositeAction[] = ["IGNORE", "EXIT", "REVERSE"];
const opposite = (v: unknown, d: OppositeAction): OppositeAction => (OPPOSITE.includes(v as OppositeAction) ? (v as OppositeAction) : d);

/** The stored trading system, or null when it isn't one. */
export function parseSystemDefinition(json: unknown): TradingSystemDefinition | null {
  if (!isObj(json) || json.schema !== 2 || tooBig(json)) return null;
  const base = emptySystem(typeof json.instrumentId === "string" ? json.instrumentId : "");
  const tf = isObj(json.timeframes) ? json.timeframes : {};
  const sessions = isObj(json.sessions) ? json.sessions : {};
  const capital = isObj(json.capital) ? json.capital : {};
  const conflict = isObj(json.conflict) ? json.conflict : {};
  const opp = isObj(json.opposite) ? json.opposite : {};
  const seen = new Set<string>();
  const concepts = (Array.isArray(json.concepts) ? json.concepts : [])
    .filter((c): c is Record<string, unknown> => isObj(c) && typeof c.conceptId === "string" && !seen.has(c.conceptId) && !!seen.add(c.conceptId))
    .slice(0, SYSTEM_LIMITS.concepts)
    .map((c) => ({ conceptId: c.conceptId as string, enabled: c.enabled !== false }));
  const productType = json.productType === "DELIVERY" ? "DELIVERY" : "INTRADAY";
  return {
    ...base,
    concepts,
    timeframes: { primary: tfOrNull(tf.primary) ?? base.timeframes.primary, confirmation: tfOrNull(tf.confirmation), higher: tfOrNull(tf.higher) },
    productType,
    sessions: {
      noEntryAfterMinute: num(sessions.noEntryAfterMinute),
      squareOffMinute: num(sessions.squareOffMinute),
      entryWindows: windows(sessions.entryWindows),
      noTradeWindows: windows(sessions.noTradeWindows),
    },
    capital: { total: num(capital.total) ?? base.capital.total, maxUtilizationPercent: num(capital.maxUtilizationPercent) ?? 100 },
    positionSizingMode: ["FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL", "RISK_PERCENT", "FULL_CAPITAL"].includes(json.positionSizingMode as string) ? (json.positionSizingMode as TradingSystemDefinition["positionSizingMode"]) : base.positionSizingMode,
    positionSizingValue: num(json.positionSizingValue),
    riskOptions: parseRiskOptions(json.riskOptions),
    stopLoss: leg(json.stopLoss, base.stopLoss),
    target: leg(json.target, base.target),
    trailingSl: leg(json.trailingSl, base.trailingSl),
    targets: parseTargets(json.targets),
    entryPlan: parseEntryPlan(json.entryPlan) ?? null,
    maxPyramidEntries: num(json.maxPyramidEntries) && (json.maxPyramidEntries as number) >= 1 ? Math.floor(json.maxPyramidEntries as number) : 1,
    conflict: { rule: CONFLICT_RULES.includes(conflict.rule as never) ? (conflict.rule as TradingSystemDefinition["conflict"]["rule"]) : base.conflict.rule, confirmBars: Math.max(0, Math.floor(num(conflict.confirmBars) ?? base.conflict.confirmBars)) },
    opposite: { whenLong: opposite(opp.whenLong, base.opposite.whenLong), whenShort: opposite(opp.whenShort, base.opposite.whenShort), confirmBars: Math.max(0, Math.floor(num(opp.confirmBars) ?? 0)) },
    orderType: json.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    limitMode: json.limitMode === "PRICE" ? "PRICE" : json.limitMode === "PERCENT" ? "PERCENT" : null,
    limitValue: num(json.limitValue),
  };
}
