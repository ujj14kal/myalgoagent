import type { CandleInterval } from "@/lib/market-data";
import { isIntraday } from "@/lib/market-data/timeframes";
import { checkConditionFeasibility } from "@/lib/strategy/validate-sanity";
import { validateConditionNode } from "@/lib/strategy/validate";
import { conditionToText } from "@/lib/strategy/format";
import { NEVER_EXIT_CONDITION, isNeverExitCondition, type ConditionNode } from "@/lib/strategy/types";
import { styleProblem } from "@/lib/strategy/style";
import { validateEntryPlan, validatePositionSizing, validateTargets } from "@/lib/trading-engine/step";
import { CONNECTIONS, type Connection, type LogicNode, type MemberStrategy, type WorkspaceDefinition, type WorkspaceIssue } from "./types";

/** Look-back window defaults, in candles, for the connections that have one. */
export const DEFAULT_BARS: Partial<Record<Connection, number>> = { SEQUENCE: 5, CONFIRMATION: 3, VETO: 1, DEPENDENCY: 3 };
export const CONNECTION_LABEL: Record<Connection, string> = {
  AND: "All of these (AND)",
  OR: "Any of these (OR)",
  SEQUENCE: "In order (sequence)",
  CONFIRMATION: "Confirmed by (confirmation)",
  VETO: "Unless (veto)",
  DEPENDENCY: "Only while a prerequisite holds (dependency)",
};
/** What each connection means, exactly. Shown beside the choice, so nothing is left to guess. */
export const CONNECTION_HELP: Record<Connection, string> = {
  AND: "True when every child is true on the same candle.",
  OR: "True when any child is true.",
  SEQUENCE: "The children must happen in the order listed, each within the look-back window of the next; the last one must be true on this candle.",
  CONFIRMATION: "The first child is the signal. Every other child must be true on this candle or within the look-back window before it.",
  VETO: "The first child is the signal. If any other child is true on this candle (or within the look-back window), the signal is blocked.",
  DEPENDENCY: "The first child is a prerequisite: it must have held on every candle of the look-back window (including this one). The other children must then be true on this candle.",
};
const MIN_CHILDREN: Record<Connection, number> = { AND: 1, OR: 1, SEQUENCE: 2, CONFIRMATION: 2, VETO: 2, DEPENDENCY: 2 };
export const usesBars = (c: Connection) => c === "SEQUENCE" || c === "CONFIRMATION" || c === "VETO" || c === "DEPENDENCY";

const recent = (child: ConditionNode, bars: number, mode: "ANY" | "ALL", excludeCurrent: boolean): ConditionNode => ({ kind: "recent", child, bars, mode, excludeCurrent });
const and = (children: ConditionNode[]): ConditionNode => (children.length === 1 ? children[0] : { kind: "group", op: "AND", children });

/** The rule a connection stands for, built from the rules of its children. */
export function connectionLogic(connection: Connection, bars: number, kids: ConditionNode[]): ConditionNode {
  switch (connection) {
    case "AND":
      return and(kids);
    case "OR":
      return kids.length === 1 ? kids[0] : { kind: "group", op: "OR", children: kids };
    case "SEQUENCE": {
      // last AND (everything before it, in order, happened in the window just before this candle)
      let acc = kids[0];
      for (let i = 1; i < kids.length; i++) acc = and([kids[i], recent(acc, bars, "ANY", true)]);
      return acc;
    }
    case "CONFIRMATION":
      return and([kids[0], ...kids.slice(1).map((k) => recent(k, bars, "ANY", false))]);
    case "VETO":
      return and([kids[0], ...kids.slice(1).map((k) => ({ kind: "not", child: recent(k, bars, "ANY", false) }) as ConditionNode)]);
    case "DEPENDENCY":
      return and([...kids.slice(1), recent(kids[0], bars, "ALL", false)]);
  }
}

type Ctx = { members: Map<string, MemberStrategy>; defMembers: Map<string, string>; issues: WorkspaceIssue[]; warnings: WorkspaceIssue[]; used: Set<string> };

function leafKey(n: LogicNode): string {
  return n.type === "strategy" ? `${n.member}:${n.rule}` : n.type === "rule" ? `rule:${JSON.stringify(n.condition)}` : "";
}

function build(node: LogicNode, where: string, ctx: Ctx): ConditionNode | null {
  if (node.type === "strategy") {
    const strategyId = ctx.defMembers.get(node.member);
    const m = strategyId ? ctx.members.get(strategyId) : undefined;
    if (!m) {
      ctx.issues.push({ where, message: `${node.member ? `Strategy "${node.member}"` : "A strategy"} isn't one of this workspace's strategies any more. Add it again or remove it from the logic.` });
      return null;
    }
    ctx.used.add(m.id);
    if (m.mode === "WEBHOOK") {
      ctx.issues.push({ where, message: `${m.name} trades on TradingView alerts, so it has no rules to combine.` });
      return null;
    }
    const cond = node.rule === "ENTRY" ? m.entryCondition : m.exitCondition;
    if (node.rule === "EXIT" && isNeverExitCondition(cond)) {
      ctx.issues.push({ where, message: `${m.name} has no exit rule (it exits on stops or targets only), so there is nothing to use here.` });
      return null;
    }
    return cond;
  }
  if (node.type === "rule") {
    if (node.source !== undefined && node.source.trim() === "") {
      ctx.issues.push({ where, message: `${node.label ?? "A rule of your own"} is empty. Type the rule, or remove it.` });
      return null;
    }
    try {
      validateConditionNode(node.condition);
    } catch (err) {
      ctx.issues.push({ where, message: `${node.label ?? "A rule"} isn't valid: ${err instanceof Error ? err.message : "check it"}.` });
      return null;
    }
    return node.condition;
  }
  if (!CONNECTIONS.includes(node.connection)) {
    ctx.issues.push({ where, message: `Unknown connection "${node.connection}".` });
    return null;
  }
  if (node.children.length === 0) {
    ctx.issues.push({ where, message: "This group is empty. Add the rules it should connect, or remove it." });
    return null;
  }
  if (node.children.length < MIN_CHILDREN[node.connection]) {
    ctx.issues.push({ where, message: `"${CONNECTION_LABEL[node.connection]}" connects at least ${MIN_CHILDREN[node.connection]} rules; this one has ${node.children.length}. Add another, or choose a different connection.` });
  }
  const seen = new Set<string>();
  for (const child of node.children) {
    const k = leafKey(child);
    if (k && seen.has(k)) ctx.warnings.push({ where, message: "The same rule appears twice in this group, which does nothing. Remove one." });
    if (k) seen.add(k);
  }
  const bars = node.bars ?? DEFAULT_BARS[node.connection] ?? 1;
  if (usesBars(node.connection) && (!Number.isInteger(bars) || bars < 1 || bars > 500)) {
    ctx.issues.push({ where, message: `The look-back window must be a whole number of candles from 1 to 500 (it is ${node.bars}).` });
    return null;
  }
  const kids = node.children.map((c, i) => build(c, `${where} › ${node.connection.toLowerCase()} #${i + 1}`, ctx));
  if (kids.some((k) => k === null) || node.children.length < MIN_CHILDREN[node.connection]) return null;
  return connectionLogic(node.connection, bars, kids as ConditionNode[]);
}

export interface WorkspaceCompiled {
  entryCondition: ConditionNode | null;
  exitCondition: ConditionNode;
  errors: WorkspaceIssue[];
  warnings: WorkspaceIssue[];
}

/**
 * Checks a workspace and turns its logic into the entry and exit rules of an ordinary strategy. Every problem found
 * is returned (not just the first), each saying where it is and how to fix it. Nothing here needs the database.
 */
export function compileWorkspace(def: WorkspaceDefinition, memberStrategies: MemberStrategy[]): WorkspaceCompiled {
  const ctx: Ctx = { members: new Map(memberStrategies.map((m) => [m.id, m])), defMembers: new Map(def.members.map((m) => [m.id, m.strategyId])), issues: [], warnings: [], used: new Set() };
  const { issues, warnings } = ctx;

  if (!def.instrumentId) issues.push({ where: "Setup", message: "Choose the instrument this workspace trades." });
  const ids = def.members.map((m) => m.id);
  if (new Set(ids).size !== ids.length) issues.push({ where: "Strategies", message: "Two strategies share the same letter. Remove one and add it again." });
  const strategyIds = def.members.map((m) => m.strategyId);
  if (new Set(strategyIds).size !== strategyIds.length) warnings.push({ where: "Strategies", message: "The same strategy was added twice. Use it once and connect it in more than one place instead." });

  // Missing connections: the entry must exist, and every strategy added should be used.
  let entry: ConditionNode | null = null;
  if (!def.entry) issues.push({ where: "Entry logic", message: "There is no entry logic yet. Add a strategy rule or a rule of your own." });
  else entry = build(def.entry, "Entry logic", ctx);
  let exitRule: ConditionNode | null = null;
  if (def.exit) exitRule = build(def.exit, "Exit logic", ctx);
  for (const m of def.members) {
    const s = ctx.members.get(m.strategyId);
    if (!s) issues.push({ where: "Strategies", message: `Strategy ${m.id} can't be found. Remove it or add it again.` });
    else if (!ctx.used.has(s.id)) warnings.push({ where: "Strategies", message: `${s.name} (${m.id}) is added but not connected to anything. Use it in the logic, or remove it.` });
  }

  // Conflicting strategies: rules built for another direction, instrument or timeframe are judged here on this workspace's own.
  for (const s of ctx.members.values()) {
    if (!ctx.used.has(s.id)) continue;
    if (s.direction !== def.direction) warnings.push({ where: "Strategies", message: `${s.name} was built to ${s.direction === "SHORT" ? "sell short" : "buy"}; here its rules are used as conditions for a ${def.direction === "SHORT" ? "short" : "long"} position.` });
    if (s.timeframe !== def.timeframe) warnings.push({ where: "Strategies", message: `${s.name} was built for ${s.timeframe} candles; here its rules are checked on ${def.timeframe} candles.` });
  }

  // Rules that can't be true together, and other problems the strategy builder also catches.
  for (const [label, node] of [["Entry logic", entry], ["Exit logic", exitRule]] as const) {
    if (!node) continue;
    for (const i of checkConditionFeasibility(node, label === "Entry logic" ? "entry" : "exit")) issues.push({ where: label, message: i.message });
  }

  // Missing exits / risk: something must be able to close the position.
  const hasStaged = (def.targets?.length ?? 0) > 0;
  const hasExit = !!exitRule || def.stopLoss.enabled || def.target.enabled || def.trailingSl.enabled || hasStaged || !!def.entryPlan?.maxHoldDays || (def.squareOffMinute != null);
  if (!hasExit) issues.push({ where: "Exits", message: "Nothing can close this position. Add an exit rule, a stop-loss, a target, a trailing stop, staged targets or a holding limit." });

  // Quantities, targets, allocation.
  try {
    validatePositionSizing({ mode: def.positionSizingMode, value: def.positionSizingValue });
  } catch (err) {
    issues.push({ where: "Position size", message: err instanceof Error ? err.message : "The position size isn't valid." });
  }
  if (def.positionSizingMode === "RISK_PERCENT" && !def.stopLoss.enabled) issues.push({ where: "Position size", message: "Sizing by risk needs a stop-loss: its distance decides how many shares fit within the amount you risk." });
  for (const [name, leg] of [["Stop-loss", def.stopLoss], ["Target", def.target], ["Trailing stop", def.trailingSl]] as const) {
    if (leg.enabled && !(leg.value > 0)) issues.push({ where: "Exits", message: `${name} is on but its distance is ${leg.value}. Enter a number above 0.` });
  }
  const stagedProblem = validateTargets(def.targets, def.target.enabled);
  if (stagedProblem) issues.push({ where: "Targets", message: stagedProblem });
  const planProblem = validateEntryPlan(def.entryPlan ?? undefined, def.maxPyramidEntries);
  if (planProblem) issues.push({ where: "Entry plan", message: planProblem });
  if (def.maxPyramidEntries < 1) issues.push({ where: "Entry plan", message: "Max entries per position must be at least 1." });
  const styleIssue = styleProblem(def.style, { timeframe: def.timeframe, productType: def.productType ?? (isIntraday(def.timeframe as CandleInterval) ? "INTRADAY" : "DELIVERY"), direction: def.direction });
  if (styleIssue) issues.push({ where: "Setup", message: styleIssue });
  if (def.direction === "SHORT" && (def.productType ?? (isIntraday(def.timeframe as CandleInterval) ? "INTRADAY" : "DELIVERY")) === "DELIVERY") issues.push({ where: "Setup", message: "A short position can't be held overnight in the cash market: choose intraday, or go long." });

  return { entryCondition: entry, exitCondition: exitRule ?? NEVER_EXIT_CONDITION, errors: issues, warnings };
}

/** The whole entry (or exit) logic as a plain sentence, for previews and for the agent. */
export function describeLogic(node: LogicNode | null, members: { id: string; name: string }[]): string {
  if (!node) return "nothing yet";
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const walk = (n: LogicNode): string => {
    if (n.type === "strategy") return `${name(n.member)}'s ${n.rule === "ENTRY" ? "entry" : "exit"} rule`;
    if (n.type === "rule") return n.label ? `${n.label} (${conditionToText(n.condition)})` : conditionToText(n.condition);
    const kids = n.children.map(walk);
    const bars = n.bars ?? DEFAULT_BARS[n.connection] ?? 1;
    const span = `${bars} candle${bars === 1 ? "" : "s"}`;
    switch (n.connection) {
      case "AND":
        return kids.length === 1 ? kids[0] : `(${kids.join(" AND ")})`;
      case "OR":
        return kids.length === 1 ? kids[0] : `(${kids.join(" OR ")})`;
      case "SEQUENCE":
        return `(${kids.join(", then ")} — each within ${span} of the next)`;
      case "CONFIRMATION":
        return `(${kids[0]}, confirmed by ${kids.slice(1).join(" and ")} within ${span})`;
      case "VETO":
        return `(${kids[0]}, unless ${kids.slice(1).join(" or ")}${bars > 1 ? ` within ${span}` : ""})`;
      case "DEPENDENCY":
        return `(${kids.slice(1).join(" and ")}, only after ${kids[0]} has held for ${span})`;
    }
  };
  return walk(node);
}
