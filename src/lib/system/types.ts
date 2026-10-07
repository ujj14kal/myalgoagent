import type { ConditionNode } from "@/lib/strategy/types";
import type { Connection } from "@/lib/workspace/types";
import type { EntryPlan, PositionSizingMode, RiskLegInput, TargetLevel } from "@/lib/trading-engine/step";
import type { RiskOptions } from "@/lib/trading-engine/risk-options";

// The workspace's three layers, each with one job:
//
//  BLOCK          "What is this market component?"            — one reusable definition (My BOS, My FVG, London
//                                                                session, price in my demand zone). A condition, nothing
//                                                                else: no instrument, capital, size, side, TP/SL or orders.
//  CONCEPT        "How do components combine into a setup?"   — blocks joined by connections (all / any / in sequence
//                                                                / confirmed by / unless / only after), some optional,
//                                                                classified Bullish or Bearish, with how its entry is considered.
//                                                                It outputs "setup valid" — it never trades.
//  TRADING SYSTEM "What do I do with these setups?"           — picks concepts and makes every trading decision:
//                                                                instrument, timeframes, sessions, capital, sizing,
//                                                                leverage, risk, exits, conflicts, reversals, execution.
//
// Publishing a trading system snapshots the blocks and concepts it uses into the version, so what was tested is
// exactly what runs even if a block is edited later.

export interface BlockDefinition {
  schema: 1;
  /** The component's logic: any rule the builder can express (indicators, price, patterns, smart-money, time, custom indicators). */
  condition: ConditionNode;
  /** The chart the component is read on, e.g. "60m" for an hourly trend block; omitted = the chart the trading system trades on. */
  timeframe?: string | null;
}

export type ConceptClass = "BULLISH" | "BEARISH";
/** Kept open so more classifications can be added later without a new data model. */
export const CONCEPT_CLASSES: ConceptClass[] = ["BULLISH", "BEARISH"];

export type ConceptNode =
  | {
      type: "block";
      blockId: string;
      /** Optional blocks don't decide whether the setup is valid; each one present raises its confidence. */
      optional?: boolean;
    }
  | { type: "group"; connection: Connection; bars?: number; children: ConceptNode[] };

/** How a valid setup becomes an entry. */
export interface ConceptEntry {
  /** FORMED: once, on the candle the setup becomes valid. WHILE_VALID: on any candle it is valid (and the system is flat). */
  trigger: "FORMED" | "WHILE_VALID";
  /** The setup must have stayed valid this many extra candles first (0 = enter at once). */
  confirmBars: number;
}
export const DEFAULT_CONCEPT_ENTRY: ConceptEntry = { trigger: "FORMED", confirmBars: 0 };

export interface ConceptDefinition {
  schema: 1;
  logic: ConceptNode | null;
  /** How its entry is considered (default: once, when the setup becomes valid). */
  entry?: ConceptEntry;
}

/** A concept as stored in a published system version: its name, side and its blocks' logic, resolved. */
export interface ConceptSnapshot {
  id: string;
  name: string;
  classification: ConceptClass;
  definition: ConceptDefinition;
  blocks: Record<string, { name: string; definition: BlockDefinition }>;
}

/** What happens when a bullish and a bearish concept are both valid on the same candle while flat. */
export type ConflictRule = "BULLISH" | "BEARISH" | "FIRST" | "HIGHER_TIMEFRAME" | "CONFIDENCE" | "IGNORE" | "WAIT";
export const CONFLICT_RULES: ConflictRule[] = ["BULLISH", "BEARISH", "FIRST", "HIGHER_TIMEFRAME", "CONFIDENCE", "IGNORE", "WAIT"];

/** What happens to an open position when a concept of the other side becomes valid. */
export type OppositeAction = "IGNORE" | "EXIT" | "REVERSE";

export interface TradingSystemDefinition {
  schema: 2;
  /** `role`: ENTRY (default) concepts open positions; EXIT concepts only close the opposite side's positions. */
  concepts: { conceptId: string; enabled: boolean; role?: "ENTRY" | "EXIT" }[];
  /** Asset class: only NSE stocks and indices can be traded here today. */
  instrumentType: "STOCK";
  instrumentId: string;
  /** The chart the system trades on. Blocks that need another chart name it themselves. */
  timeframes: { primary: string };
  productType: "INTRADAY" | "DELIVERY";
  sessions: {
    noEntryAfterMinute: number | null;
    squareOffMinute: number | null;
    /** Only open positions inside these IST windows (none = any time). */
    entryWindows: { startMinute: number; endMinute: number }[];
    /** Never open positions inside these IST windows. */
    noTradeWindows: { startMinute: number; endMinute: number }[];
  };
  capital: {
    /** The capital the system trades with (backtests and forward tests start here). */
    total: number;
    /** The most of the capital one position may use (100 = all of it). */
    maxUtilizationPercent: number;
  };
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  riskOptions: RiskOptions;
  stopLoss: RiskLegInput;
  target: RiskLegInput;
  trailingSl: RiskLegInput;
  targets: TargetLevel[];
  entryPlan: EntryPlan | null;
  maxPyramidEntries: number;
  conflict: { rule: ConflictRule; /** WAIT: candles a side must stay valid on its own. */ confirmBars: number };
  opposite: {
    /** Long + a bearish setup. */
    whenLong: OppositeAction;
    /** Short + a bullish setup. */
    whenShort: OppositeAction;
    /** Wait for confirmation: the opposite setup must hold this many candles first (0 = act at once). */
    confirmBars: number;
  };
  orderType: "MARKET" | "LIMIT";
  limitMode: "PERCENT" | "PRICE" | null;
  limitValue: number | null;
}

/** What the engine needs per concept: its rule, its optional (confidence) rules, its entry trigger and its timeframe rank. */
export interface ConceptRuntime {
  name: string;
  side: ConceptClass;
  condition: ConditionNode;
  optionals: ConditionNode[];
  /** The longest chart (in minutes) any of its blocks is read on; 0 = all on the system's own chart. */
  timeframeRank: number;
  entry?: ConceptEntry;
  /** EXIT concepts never open a position; they only close the opposite side's. */
  role?: "ENTRY" | "EXIT";
}

/** Stored on the published strategy: everything the two-way engine needs beyond the strategy's own fields. */
export interface SystemRuntime {
  schema: 1;
  concepts: ConceptRuntime[];
  conflict: TradingSystemDefinition["conflict"];
  opposite: TradingSystemDefinition["opposite"];
  /** Delivery positions can't be short: bearish setups then only act on open longs. */
  allowShort: boolean;
  entryWindows: TradingSystemDefinition["sessions"]["entryWindows"];
  noTradeWindows: TradingSystemDefinition["sessions"]["noTradeWindows"];
  /** The system's capital: where its backtests and forward tests start. */
  capital?: number;
}

export type SystemIssue = { where: string; message: string };
