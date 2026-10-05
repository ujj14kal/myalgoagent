import type { ConditionNode } from "@/lib/strategy/types";
import type { EntryPlan, PositionSizingMode, RiskLegInput, TargetLevel } from "@/lib/trading-engine/step";
import type { StrategyStyle } from "@/lib/strategy/style";

// A workspace combines existing strategies (and inline rules) into ONE plan: how their signals are connected, how the
// position is built (entry plan), how it is left (staged targets, stops, a holding limit) and how it is sized.
// Publishing turns a version of it into an ordinary strategy that runs through the same backtest, forward test and
// live engines, so what is tested is exactly what runs.

/** How the children of a group relate. Each has one exact meaning (see `connectionLogic`). */
export type Connection = "AND" | "OR" | "SEQUENCE" | "CONFIRMATION" | "VETO" | "DEPENDENCY";
export const CONNECTIONS: Connection[] = ["AND", "OR", "SEQUENCE", "CONFIRMATION", "VETO", "DEPENDENCY"];

export type LogicNode =
  /** A saved strategy's entry or exit rule, by the member it was added as. */
  | { type: "strategy"; member: string; rule: "ENTRY" | "EXIT" }
  /** A rule written here: an indicator test, a time trigger, a pattern, a filter. */
  | { type: "rule"; condition: ConditionNode; label?: string; /** The rule as typed in the strategy language, kept so the editor can show it back. */ source?: string }
  | { type: "group"; connection: Connection; /** The look-back window in candles, for connections that have one. */ bars?: number; children: LogicNode[]; label?: string };

export interface WorkspaceMember {
  /** A short id used by the logic ("A", "B"…). */
  id: string;
  strategyId: string;
}

export interface WorkspaceDefinition {
  schema: 1;
  instrumentId: string;
  direction: "LONG" | "SHORT";
  timeframe: string;
  style?: StrategyStyle | null;
  productType?: "INTRADAY" | "DELIVERY";
  members: WorkspaceMember[];
  entry: LogicNode | null;
  /** Optional: a rule that closes the position. Without one the stops, targets or holding limit must. */
  exit: LogicNode | null;
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLoss: RiskLegInput;
  target: RiskLegInput;
  trailingSl: RiskLegInput;
  targets?: TargetLevel[];
  entryPlan?: EntryPlan | null;
  maxPyramidEntries: number;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
  orderType?: "MARKET" | "LIMIT";
  limitMode?: "PERCENT" | "PRICE" | null;
  limitValue?: number | null;
}

export type WorkspaceIssue = { message: string; /** Where in the plan, in words. */ where?: string };

/** What the member strategies contribute: their saved rules and the facts used to warn about mismatches. */
export interface MemberStrategy {
  id: string;
  name: string;
  mode: "NO_CODE" | "CODE" | "WEBHOOK";
  direction: "LONG" | "SHORT";
  instrumentSymbol: string;
  timeframe: string;
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
}
