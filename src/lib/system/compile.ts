import type { ConditionNode } from "@/lib/strategy/types";
import type { CandleInterval } from "@/lib/market-data";
import { validateConditionNode } from "@/lib/strategy/validate";
import { checkConditionFeasibility } from "@/lib/strategy/validate-sanity";
import { conditionToText } from "@/lib/strategy/format";
import { isIntraday } from "@/lib/market-data/timeframes";
import { connectionLogic, CONNECTION_LABEL, DEFAULT_BARS, usesBars } from "@/lib/workspace/compile";
import { CONNECTIONS } from "@/lib/workspace/types";
import { validateEntryPlan, validatePositionSizing, validateTargets } from "@/lib/trading-engine/step";
import { riskOptionsProblem } from "@/lib/trading-engine/risk-options";
import { DEFAULT_CONCEPT_ENTRY, type BlockDefinition, type ConceptDefinition, type ConceptNode, type ConceptRuntime, type ConceptSnapshot, type SystemIssue, type SystemRuntime, type TradingSystemDefinition } from "./types";

const MIN_CHILDREN: Record<string, number> = { AND: 1, OR: 1, SEQUENCE: 2, CONFIRMATION: 2, VETO: 2, DEPENDENCY: 2 };
/** Minutes per chart size, to tell which of two blocks reads the longer chart. */
const MINUTES: Record<string, number> = { "1m": 1, "2m": 2, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "4h": 240, "1d": 1440, "1wk": 10080 };
export const timeframeMinutes = (tf: string | null | undefined) => (tf ? (MINUTES[tf] ?? 0) : 0);

/**
 * Reads every part of a rule on another timeframe (operands and patterns that don't already name one). The
 * primary timeframe needs nothing — it's the chart the system trades on.
 */
export function onTimeframe(node: ConditionNode, tf: string | null): ConditionNode {
  if (!tf) return node;
  const t = tf as CandleInterval;
  switch (node.kind) {
    case "group":
      return { ...node, children: node.children.map((c) => onTimeframe(c, tf)) };
    case "not":
    case "recent":
      return { ...node, child: onTimeframe(node.child, tf) };
    case "comparison": {
      const op = (o: typeof node.left) => (o.kind === "constant" || o.timeframe ? o : { ...o, timeframe: t });
      return { ...node, left: op(node.left), right: op(node.right) };
    }
    case "signal": {
      const s = node.signal;
      if (s.family === "TIME_WINDOW" || s.timeframe) return node;
      return { ...node, signal: { ...s, timeframe: t } };
    }
  }
}

/** Checks a block on its own: a condition the builder accepts, and nothing a block may not hold. */
export function blockProblems(def: BlockDefinition, name = "This block"): SystemIssue[] {
  const issues: SystemIssue[] = [];
  try {
    validateConditionNode(def.condition);
  } catch (err) {
    issues.push({ where: name, message: `${name} isn't a valid rule: ${err instanceof Error ? err.message : "check it"}.` });
    return issues;
  }
  for (const i of checkConditionFeasibility(def.condition, "entry")) issues.push({ where: name, message: i.message });
  return issues;
}

type ConceptCtx = { blocks: Record<string, { name: string; definition: BlockDefinition }>; issues: SystemIssue[]; optionals: ConditionNode[]; rank: number };

function build(node: ConceptNode, where: string, ctx: ConceptCtx): ConditionNode | null {
  if (node.type === "block") {
    const b = ctx.blocks[node.blockId];
    if (!b) {
      ctx.issues.push({ where, message: "A block in this concept no longer exists. Add it again or remove it." });
      return null;
    }
    // A block is read on its own chart when it names one (an hourly trend block), else on the system's chart.
    const tf = b.definition.timeframe ?? null;
    ctx.rank = Math.max(ctx.rank, timeframeMinutes(tf));
    return onTimeframe(b.definition.condition, tf);
  }
  if (!CONNECTIONS.includes(node.connection)) {
    ctx.issues.push({ where, message: `Unknown connection "${node.connection}".` });
    return null;
  }
  // Optional blocks don't decide validity: they're kept aside and only raise the confidence.
  const required = node.children.filter((c) => !(c.type === "block" && c.optional));
  for (const opt of node.children) {
    if (opt.type !== "block" || !opt.optional) continue;
    const cond = build({ ...opt, optional: false }, where, ctx);
    if (cond) ctx.optionals.push(cond);
  }
  if (required.length === 0) {
    ctx.issues.push({ where, message: "Every block in this group is optional, so nothing decides whether the setup is valid. Make at least one required." });
    return null;
  }
  if (required.length < MIN_CHILDREN[node.connection]) {
    ctx.issues.push({ where, message: `“${CONNECTION_LABEL[node.connection]}” needs at least ${MIN_CHILDREN[node.connection]} required blocks; this has ${required.length}.` });
    return null;
  }
  const bars = node.bars ?? DEFAULT_BARS[node.connection] ?? 1;
  if (usesBars(node.connection) && (!Number.isInteger(bars) || bars < 1 || bars > 500)) {
    ctx.issues.push({ where, message: `The look-back must be a whole number of candles from 1 to 500 (it is ${node.bars}).` });
    return null;
  }
  const kids = required.map((c, i) => build(c, `${where} › ${node.connection.toLowerCase()} #${i + 1}`, ctx));
  if (kids.some((k) => k === null)) return null;
  return connectionLogic(node.connection, bars, kids as ConditionNode[]);
}

/** A concept's runtime form: the setup rule, its optional (confidence) rules and its timeframe rank. */
export function compileConcept(c: ConceptSnapshot): { runtime: ConceptRuntime | null; issues: SystemIssue[] } {
  const ctx: ConceptCtx = { blocks: c.blocks, issues: [], optionals: [], rank: 0 };
  if (!c.definition.logic) return { runtime: null, issues: [{ where: c.name, message: `“${c.name}” has no blocks yet. Add the blocks that make up the setup.` }] };
  const condition = build(c.definition.logic, c.name, ctx);
  if (!condition || ctx.issues.length) return { runtime: null, issues: ctx.issues };
  for (const i of checkConditionFeasibility(condition, "entry")) ctx.issues.push({ where: c.name, message: i.message });
  const entry = c.definition.entry ?? DEFAULT_CONCEPT_ENTRY;
  if (!(Number.isInteger(entry.confirmBars) && entry.confirmBars >= 0 && entry.confirmBars <= 50)) ctx.issues.push({ where: c.name, message: "The wait before entry must be a whole number of candles from 0 to 50." });
  return { runtime: { name: c.name, side: c.classification, condition, optionals: ctx.optionals, timeframeRank: ctx.rank, entry }, issues: ctx.issues };
}

/** Problems with a concept on its own (before any system sets timeframes): every block exists and the logic is complete. */
export function conceptProblems(def: ConceptDefinition, blocks: Record<string, { name: string; definition: BlockDefinition }>, name = "This concept"): SystemIssue[] {
  return compileConcept({ id: "", name, classification: "BULLISH", definition: def, blocks }).issues;
}

export interface CompiledSystem {
  runtime: SystemRuntime | null;
  /** The bullish setups combined (what opens a long); null when there are none. */
  longEntry: ConditionNode | null;
  shortEntry: ConditionNode | null;
  errors: SystemIssue[];
  warnings: SystemIssue[];
}

const anyOf = (xs: ConditionNode[]): ConditionNode | null => (xs.length === 0 ? null : xs.length === 1 ? xs[0] : { kind: "group", op: "OR", children: xs });

/** Checks a trading system and builds what the engine runs. Every problem is listed with where it is and how to fix it. */
export function compileSystem(def: TradingSystemDefinition, concepts: ConceptSnapshot[]): CompiledSystem {
  const errors: SystemIssue[] = [];
  const warnings: SystemIssue[] = [];
  const byId = new Map(concepts.map((c) => [c.id, c]));

  if (!def.instrumentId) errors.push({ where: "Instruments", message: "Choose the instrument this system trades." });
  if (def.instrumentType !== "STOCK") errors.push({ where: "Instruments", message: "Only NSE stocks and indices can be traded by a system today." });
  const intraday = isIntraday(def.timeframes.primary as CandleInterval);
  if (def.productType === "INTRADAY" && !intraday) errors.push({ where: "Timeframes", message: "An intraday system needs an intraday primary timeframe (1 minute to 4 hours)." });

  const runtimes: ConceptRuntime[] = [];
  const enabled = def.concepts.filter((c) => c.enabled);
  if (enabled.length === 0) errors.push({ where: "Concepts", message: "Add at least one concept — the setups this system trades." });
  for (const ref of enabled) {
    const c = byId.get(ref.conceptId);
    if (!c) {
      errors.push({ where: "Concepts", message: "A concept in this system no longer exists. Remove it or add it again." });
      continue;
    }
    const { runtime, issues } = compileConcept(c);
    errors.push(...issues);
    if (runtime) runtimes.push({ ...runtime, role: ref.role === "EXIT" ? "EXIT" : "ENTRY" });
  }
  // ENTRY concepts open positions; EXIT concepts only close the opposite side's (a bearish one closes longs).
  const entries = runtimes.filter((r) => r.role !== "EXIT");
  const exitOnly = runtimes.filter((r) => r.role === "EXIT");
  const bull = entries.filter((r) => r.side === "BULLISH");
  const bear = entries.filter((r) => r.side === "BEARISH");
  const allowShort = def.productType === "INTRADAY";
  if (runtimes.length && entries.length === 0) errors.push({ where: "Concepts", message: "Every concept here only closes positions. Add at least one that opens them." });
  if (exitOnly.some((r) => r.side === "BULLISH") && !allowShort) warnings.push({ where: "Concepts", message: "A bullish exit concept closes short positions, and a delivery system never holds one." });
  if (runtimes.length && entries.length > 0 && !bull.length && !allowShort) errors.push({ where: "Concepts", message: "A delivery system can only hold long positions, so it needs at least one bullish concept (bearish ones can only close a long)." });
  if (bear.length && !allowShort && def.opposite.whenLong === "IGNORE") warnings.push({ where: "Position management", message: "Bearish concepts do nothing in a delivery system unless “Long + bearish setup” is set to exit." });
  if (bear.length && !allowShort && def.opposite.whenLong === "REVERSE") warnings.push({ where: "Position management", message: "A delivery system can't go short, so “reverse” only exits the long." });

  // Risk, sizing, exits.
  try {
    validatePositionSizing({ mode: def.positionSizingMode, value: def.positionSizingValue });
  } catch (err) {
    errors.push({ where: "Position sizing", message: err instanceof Error ? err.message : "The position size isn't valid." });
  }
  if (def.positionSizingMode === "RISK_PERCENT" && !def.stopLoss.enabled) errors.push({ where: "Position sizing", message: "Sizing by risk needs a stop-loss: its distance decides how many shares fit within the amount you risk." });
  const opts = riskOptionsProblem(def.riskOptions, { productType: def.productType, stopLossOn: def.stopLoss.enabled, sizingMode: def.positionSizingMode });
  if (opts) errors.push({ where: "Risk management", message: opts });
  for (const [name, leg] of [["Stop-loss", def.stopLoss], ["Target", def.target], ["Trailing stop", def.trailingSl]] as const) {
    if (leg.enabled && !(leg.value > 0)) errors.push({ where: "Risk management", message: `${name} is on but its distance is ${leg.value}. Enter a number above 0.` });
  }
  if ((def.stopLoss.enabled && def.stopLoss.unit === "R_MULTIPLE") || (def.trailingSl.enabled && def.trailingSl.unit === "R_MULTIPLE")) errors.push({ where: "Risk management", message: "Only targets can be set in R (R is the stop-loss distance)." });
  if (((def.target.enabled && def.target.unit === "R_MULTIPLE") || def.targets.some((t) => t.unit === "R_MULTIPLE")) && !def.stopLoss.enabled) errors.push({ where: "Risk management", message: "A target in R needs a stop-loss." });
  const staged = validateTargets(def.targets, def.target.enabled);
  if (staged) errors.push({ where: "Multi-target exits", message: staged });
  const plan = validateEntryPlan(def.entryPlan ?? undefined, def.maxPyramidEntries);
  if (plan) errors.push({ where: "Entries", message: plan });
  const exits = def.stopLoss.enabled || def.target.enabled || def.trailingSl.enabled || def.targets.length > 0 || def.productType === "INTRADAY" || def.opposite.whenLong !== "IGNORE" || def.opposite.whenShort !== "IGNORE" || !!def.entryPlan?.maxHoldDays;
  if (!exits) errors.push({ where: "Risk management", message: "Nothing can close a position: add a stop-loss, a target, a trailing stop, multi-target exits, or let the opposite setup exit it." });
  if (!(def.capital.total > 0)) errors.push({ where: "Capital", message: "Enter the capital this system trades with." });
  if (!(def.capital.maxUtilizationPercent > 0) || def.capital.maxUtilizationPercent > 100) errors.push({ where: "Capital", message: "Maximum capital use per position must be between 1% and 100%." });

  // Sessions: IST minutes, sensible windows, intraday only.
  for (const [label, list] of [["Trading windows", def.sessions.entryWindows], ["No-trade periods", def.sessions.noTradeWindows]] as const) {
    if (list.length && !intraday) errors.push({ where: "Sessions", message: `${label} need an intraday primary timeframe.` });
    for (const w of list) if (!(w.endMinute > w.startMinute) || w.startMinute < 555 || w.endMinute > 930) errors.push({ where: "Sessions", message: `${label}: each window must end after it starts, within market hours (09:15–15:30).` });
  }
  if (def.orderType === "LIMIT" && def.limitMode === "PRICE" && allowShort && bull.length && bear.length) errors.push({ where: "Execution", message: "One fixed limit price can't serve both long and short entries. Use a limit a % from the signal price instead." });
  if (def.orderType === "LIMIT" && !(def.limitValue != null && def.limitValue > 0)) errors.push({ where: "Execution", message: "Enter the limit (a % from the signal price, or a price above 0)." });
  if (def.conflict.rule === "WAIT" && !(def.conflict.confirmBars >= 1)) errors.push({ where: "Conflicts", message: "“Wait for confirmation” needs at least 1 candle." });
  if (def.opposite.confirmBars < 0 || !Number.isInteger(def.opposite.confirmBars)) errors.push({ where: "Position management", message: "The confirmation wait must be a whole number of candles (0 = act at once)." });

  const runtime: SystemRuntime | null =
    errors.length === 0
      ? { schema: 1, concepts: runtimes, conflict: def.conflict, opposite: def.opposite, allowShort, entryWindows: def.sessions.entryWindows, noTradeWindows: def.sessions.noTradeWindows, capital: def.capital.total }
      : null;
  return { runtime, longEntry: anyOf(bull.map((r) => r.condition)), shortEntry: allowShort ? anyOf(bear.map((r) => r.condition)) : null, errors, warnings };
}

/** A concept's logic in one sentence (block names and connections). */
export function describeConcept(def: ConceptDefinition, blocks: Record<string, { name: string; definition?: { timeframe?: string | null } }>): string {
  const walk = (n: ConceptNode): string => {
    if (n.type === "block") {
      const name = blocks[n.blockId]?.name ?? "a missing block";
      const tf = blocks[n.blockId]?.definition?.timeframe;
      return `${name}${tf ? ` (${tf})` : ""}${n.optional ? " [optional]" : ""}`;
    }
    const req = n.children.filter((c) => !(c.type === "block" && c.optional)).map(walk);
    const opt = n.children.filter((c) => c.type === "block" && c.optional).map(walk);
    const bars = n.bars ?? DEFAULT_BARS[n.connection] ?? 1;
    const span = `${bars} candle${bars === 1 ? "" : "s"}`;
    const core =
      n.connection === "AND"
        ? req.join(" AND ")
        : n.connection === "OR"
          ? req.join(" OR ")
          : n.connection === "SEQUENCE"
            ? `${req.join(" → ")} (each within ${span})`
            : n.connection === "CONFIRMATION"
              ? `${req[0]}, confirmed by ${req.slice(1).join(" and ")} within ${span}`
              : n.connection === "VETO"
                ? `${req[0]}, unless ${req.slice(1).join(" or ")}`
                : `${req.slice(1).join(" and ")}, only after ${req[0]} held for ${span}`;
    return `(${core}${opt.length ? `; optional: ${opt.join(", ")}` : ""})`;
  };
  const setup = def.logic ? walk(def.logic).replace(/^\((.*)\)$/, "$1") : "no blocks yet";
  const e = def.entry;
  const when = !e || (e.trigger === "FORMED" && e.confirmBars === 0) ? "" : ` — enters ${e.trigger === "WHILE_VALID" ? "on any candle it is valid" : "when it first becomes valid"}${e.confirmBars > 0 ? `, once it has held ${e.confirmBars} more candle${e.confirmBars === 1 ? "" : "s"}` : ""}`;
  return setup + when;
}

/** A rule in words, for block previews. */
export const describeBlock = (def: BlockDefinition) => conditionToText(def.condition);
