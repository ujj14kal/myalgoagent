import type { RiskLegInput } from "@/lib/trading-engine/step";
import { validateConditionNode } from "@/lib/strategy/validate";
import { parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import { parseTargets } from "@/lib/trading-engine/targets-config";
import { parseStyle } from "@/lib/strategy/style";
import { CONNECTIONS, type LogicNode, type WorkspaceDefinition } from "./types";

// A workspace's plan is stored as JSON. Reading it back is defensive and bounded: anything malformed is repaired or
// dropped rather than trusted, and a plan can't grow without limit.

export const LIMITS = { members: 20, depth: 6, nodes: 200, bytes: 200_000 } as const;

export function emptyDefinition(instrumentId = ""): WorkspaceDefinition {
  return {
    schema: 1,
    instrumentId,
    direction: "LONG",
    timeframe: "1d",
    style: null,
    productType: "DELIVERY",
    members: [],
    entry: null,
    exit: null,
    positionSizingMode: "FULL_CAPITAL",
    positionSizingValue: null,
    stopLoss: { enabled: true, unit: "PERCENT", value: 5 },
    target: { enabled: false, unit: "PERCENT", value: 10 },
    trailingSl: { enabled: false, unit: "PERCENT", value: 3 },
    maxPyramidEntries: 1,
    noEntryAfterMinute: null,
    squareOffMinute: null,
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const leg = (v: unknown, fallback: RiskLegInput) => {
  if (!isObj(v)) return fallback;
  const unit = v.unit === "POINTS" || v.unit === "ATR_MULTIPLE" || v.unit === "R_MULTIPLE" ? v.unit : "PERCENT";
  return { enabled: v.enabled === true, unit, value: typeof v.value === "number" && Number.isFinite(v.value) ? v.value : fallback.value } as typeof fallback;
};

function parseNode(v: unknown, depth: number, budget: { n: number }): LogicNode | null {
  if (!isObj(v) || depth > LIMITS.depth || ++budget.n > LIMITS.nodes) return null;
  if (v.type === "strategy") {
    if (typeof v.member !== "string" || (v.rule !== "ENTRY" && v.rule !== "EXIT")) return null;
    return { type: "strategy", member: v.member.slice(0, 8), rule: v.rule };
  }
  if (v.type === "rule") {
    try {
      validateConditionNode(v.condition);
    } catch {
      return null;
    }
    return { type: "rule", condition: v.condition as never, ...(typeof v.label === "string" ? { label: v.label.slice(0, 60) } : {}), ...(typeof v.source === "string" ? { source: v.source.slice(0, 500) } : {}) };
  }
  if (v.type === "group") {
    if (typeof v.connection !== "string" || !CONNECTIONS.includes(v.connection as never)) return null;
    const children = (Array.isArray(v.children) ? v.children : []).map((c) => parseNode(c, depth + 1, budget)).filter((c): c is LogicNode => c !== null);
    return {
      type: "group",
      connection: v.connection as never,
      ...(typeof v.bars === "number" && Number.isFinite(v.bars) ? { bars: Math.floor(v.bars) } : {}),
      children,
      ...(typeof v.label === "string" ? { label: v.label.slice(0, 60) } : {}),
    };
  }
  return null;
}

/** The stored plan as a definition, or null when it isn't one at all. */
export function parseDefinition(json: unknown): WorkspaceDefinition | null {
  if (!isObj(json) || json.schema !== 1) return null;
  if (JSON.stringify(json).length > LIMITS.bytes) return null;
  const base = emptyDefinition(typeof json.instrumentId === "string" ? json.instrumentId : "");
  const budget = { n: 0 };
  const members = (Array.isArray(json.members) ? json.members : [])
    .filter((m): m is Record<string, unknown> => isObj(m) && typeof m.id === "string" && typeof m.strategyId === "string")
    .slice(0, LIMITS.members)
    .map((m) => ({ id: (m.id as string).slice(0, 8), strategyId: m.strategyId as string }));
  return {
    ...base,
    direction: json.direction === "SHORT" ? "SHORT" : "LONG",
    timeframe: typeof json.timeframe === "string" ? json.timeframe : "1d",
    style: parseStyle(json.style),
    productType: json.productType === "INTRADAY" ? "INTRADAY" : "DELIVERY",
    members,
    entry: parseNode(json.entry, 0, budget),
    exit: parseNode(json.exit, 0, budget),
    positionSizingMode: ["FIXED_QUANTITY", "FIXED_CAPITAL", "PERCENT_OF_CAPITAL", "RISK_PERCENT"].includes(json.positionSizingMode as string) ? (json.positionSizingMode as WorkspaceDefinition["positionSizingMode"]) : "FULL_CAPITAL",
    positionSizingValue: typeof json.positionSizingValue === "number" && Number.isFinite(json.positionSizingValue) ? json.positionSizingValue : null,
    stopLoss: leg(json.stopLoss, base.stopLoss),
    target: leg(json.target, base.target),
    trailingSl: leg(json.trailingSl, base.trailingSl),
    targets: parseTargets(json.targets),
    entryPlan: parseEntryPlan(json.entryPlan) ?? null,
    maxPyramidEntries: typeof json.maxPyramidEntries === "number" && json.maxPyramidEntries >= 1 ? Math.floor(json.maxPyramidEntries) : 1,
    noEntryAfterMinute: typeof json.noEntryAfterMinute === "number" ? json.noEntryAfterMinute : null,
    squareOffMinute: typeof json.squareOffMinute === "number" ? json.squareOffMinute : null,
    orderType: json.orderType === "LIMIT" ? "LIMIT" : "MARKET",
    limitMode: json.limitMode === "PRICE" ? "PRICE" : json.limitMode === "PERCENT" ? "PERCENT" : null,
    limitValue: typeof json.limitValue === "number" ? json.limitValue : null,
  };
}

/** Member ids that every strategy-type node in the plan names. */
export function usedMembers(node: LogicNode | null): string[] {
  if (!node) return [];
  if (node.type === "strategy") return [node.member];
  if (node.type === "rule") return [];
  return node.children.flatMap(usedMembers);
}
