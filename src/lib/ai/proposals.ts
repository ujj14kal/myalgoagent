import type { RiskOptions } from "@/lib/trading-engine/risk-options";
import type { StrategyInput } from "@/lib/strategy-actions";
import type { EntryPlan, TargetLevel } from "@/lib/trading-engine/step";
import type { StrategyStyle } from "@/lib/strategy/style";
import type { BlockDefinition, ConceptClass, ConceptDefinition, TradingSystemDefinition } from "@/lib/system/types";
import { NEVER_EXIT_CONDITION, type ConditionNode } from "@/lib/strategy/types";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

// An action the agent has prepared for the user to review. Stored on the
// agent's reply (AgentMessage.proposal) so it survives reloads; the status
// records what the user decided.

export type RiskUnitName = "PERCENT" | "POINTS" | "ATR_MULTIPLE" | "R_MULTIPLE";
export type SizingModeName = "FULL_CAPITAL" | "FIXED_QUANTITY" | "FIXED_CAPITAL" | "PERCENT_OF_CAPITAL" | "RISK_PERCENT";
export type ProposalStatus = "pending" | "confirmed" | "rejected";

type RiskLegDraft = { enabled: boolean; unit: RiskUnitName; value: number };

export type AgentProposal =
  | {
      kind: "strategy";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        name: string;
        instrumentId: string | null;
        instrumentSymbol: string | null;
        direction: "LONG" | "SHORT";
        /** The rules as the builder's condition tree (everything the visual builder can express). */
        entryCondition?: ConditionNode;
        /** null = no rule-based exit; the stop-loss / take-profit / trailing stop close positions. */
        exitCondition?: ConditionNode | null;
        /** Older drafts stored strategy-language text instead. */
        entrySource?: string;
        exitSource?: string;
        maxPyramidEntries?: number;
        /** Candle timeframe ("1d" default, or intraday) and intraday session rules (IST minutes). */
        timeframe?: string;
        noEntryAfterMinute?: number | null;
        squareOffMinute?: number | null;
        productType?: string;
        orderType?: string;
        limitMode?: string | null;
        limitValue?: number | null;
        /** TradingView-webhook strategy — rules come from alerts, not conditions. */
        webhook?: boolean;
        stopLoss: RiskLegDraft;
        target: RiskLegDraft;
        trailingSl: RiskLegDraft;
        /** Staged Target 1–3 (each sells a share and locks profit on the rest); replaces the single take-profit. */
        targets?: TargetLevel[];
        /** Swing strategies are held for days to weeks: daily or weekly candles, delivery, long only. */
        style?: StrategyStyle | null;
        /** Multi-level entry plan: the signal buys a share, each further level buys more as price reaches it. */
        entryPlan?: EntryPlan;
        /** TP/SL reference, intraday leverage, break-even and the system's loss limits. */
        riskOptions?: RiskOptions;
        /** Custom indicators this strategy's rules use that the user doesn't have yet: saved to their library when they confirm. */
        customIndicators?: { name: string; description?: string; def: CustomIndicatorDef }[];
        positionSizingMode: SizingModeName;
        positionSizingValue: number | null;
      };
    }
  | {
      kind: "backtest";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        strategyId: string;
        strategyName: string;
        instrumentSymbol: string;
        range: "3mo" | "6mo" | "1y" | "5y";
        startingCapital: number;
        brokeragePercent: number;
        slippagePercent: number;
      };
    }
  | {
      kind: "paper_session";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        strategyId: string;
        strategyName: string;
        instrumentSymbol: string;
        startingCapital: number;
        brokeragePercent: number;
        slippagePercent: number;
        alertOnly: boolean;
      };
    }
  | {
      kind: "risk_limits";
      status: ProposalStatus;
      resultId?: string;
      draft: { killSwitchEnabled: boolean; maxLossPercent: number | null; maxConsecutiveLosses: number | null };
    }
  | { kind: "kill_switch"; status: ProposalStatus; resultId?: string; draft: { enabled: boolean } }
  | {
      kind: "watchlist_add";
      status: ProposalStatus;
      resultId?: string;
      draft: { instrumentId: string; instrumentSymbol: string; instrumentName: string };
    }
  | {
      kind: "watchlist_remove";
      status: ProposalStatus;
      resultId?: string;
      draft: { watchlistItemId: string; instrumentSymbol: string };
    }
  | {
      kind: "paper_control";
      status: ProposalStatus;
      resultId?: string;
      draft: { sessionId: string; strategyName: string; instrumentSymbol: string; action: "sync" | "pause" | "resume" | "stop" };
    }
  | { kind: "strategy_archive"; status: ProposalStatus; resultId?: string; draft: { strategyId: string; strategyName: string } }
  | {
      kind: "strategy_update";
      status: ProposalStatus;
      resultId?: string;
      strategyId: string;
      draft: Extract<AgentProposal, { kind: "strategy" }>["draft"];
    }
  | {
      // Workspace layer 1: a block — one reusable market component as a rule (created or updated).
      kind: "block";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        name: string;
        description?: string;
        /** Set when updating an existing block. */
        blockId?: string;
        definition: BlockDefinition;
        /** The rule in plain words. */
        text: string;
      };
    }
  | {
      // Workspace layer 2: a concept — blocks combined into a bullish or bearish setup, with any new blocks it needs.
      kind: "concept";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        name: string;
        description?: string;
        conceptId?: string;
        classification: ConceptClass;
        /** Block references are the user's block ids, or "new:<name>" for a block in `newBlocks`. */
        definition: ConceptDefinition;
        newBlocks: { name: string; definition: BlockDefinition; text: string }[];
        /** The setup in plain words. */
        text: string;
      };
    }
  | {
      // Workspace layer 3: a trading system — concepts plus every trading decision (created or updated, optionally published).
      kind: "workspace";
      status: ProposalStatus;
      resultId?: string;
      draft: {
        name: string;
        description?: string;
        /** Set when updating an existing trading system. */
        workspaceId?: string;
        definition: TradingSystemDefinition;
        instrumentSymbol: string | null;
        /** Its concepts in plain words, and anything worth a look. */
        concepts: { name: string; classification: ConceptClass; text: string }[];
        warnings: string[];
        /** Publish it as the next version (a strategy to backtest, forward test and take live). */
        publish: boolean;
        note?: string;
      };
    }
  | {
      // Several steps in one review, run in order — e.g. create a strategy, backtest it, forward test it.
      kind: "plan";
      status: ProposalStatus;
      resultId?: string;
      steps: PlanStep[];
    };

/** A step inside a plan. A backtest/paper step can target the strategy the plan itself creates. */
export type PlanStep = Extract<AgentProposal, { kind: "strategy" | "backtest" | "paper_session" }>;

/** Stands in for the id of the strategy a plan creates in its first step. */
export const NEW_STRATEGY_ID = "__new_strategy__";

export const PROPOSAL_TITLES: Record<AgentProposal["kind"], string> = {
  strategy: "New strategy",
  backtest: "Run a backtest",
  paper_session: "Start forward testing",
  risk_limits: "Update loss limits",
  kill_switch: "Kill switch",
  watchlist_add: "Add to watchlist",
  watchlist_remove: "Remove from watchlist",
  paper_control: "Forward test",
  strategy_archive: "Archive strategy",
  strategy_update: "Update strategy",
  block: "Workspace block",
  concept: "Workspace concept",
  workspace: "Trading system",
  plan: "Multi-step plan",
};

/** A strategy draft as the builder's own input (code mode), for validating and creating it. */
export function toStrategyInput(
  d: Extract<AgentProposal, { kind: "strategy" }>["draft"],
  instrumentId: string
): StrategyInput {
  const common = {
    name: d.name,
    instrumentId,
    direction: d.direction,
    positionSizingMode: d.positionSizingMode,
    positionSizingValue: d.positionSizingValue,
    stopLoss: d.stopLoss,
    target: d.target,
    trailingSl: d.trailingSl,
    ...(d.targets?.length ? { targets: d.targets } : {}),
    ...(d.style ? { style: d.style } : {}),
    ...(d.entryPlan ? { entryPlan: d.entryPlan } : {}),
    ...(d.riskOptions ? { riskOptions: d.riskOptions } : {}),
    maxPyramidEntries: d.maxPyramidEntries && d.maxPyramidEntries > 0 ? Math.floor(d.maxPyramidEntries) : 1,
    timeframe: d.timeframe ?? "1d",
    noEntryAfterMinute: d.noEntryAfterMinute ?? null,
    squareOffMinute: d.squareOffMinute ?? null,
    productType: d.productType,
    orderType: d.orderType ?? "MARKET",
    limitMode: d.limitMode ?? null,
    limitValue: d.limitValue ?? null,
  };
  if (d.webhook) return { ...common, mode: "WEBHOOK" };
  if (d.entryCondition) {
    return { ...common, mode: "NO_CODE", entryCondition: d.entryCondition, exitCondition: d.exitCondition ?? NEVER_EXIT_CONDITION };
  }
  return { ...common, mode: "CODE", entrySource: d.entrySource ?? "", exitSource: d.exitSource ?? "" };
}

// Phrases that claim a prepared action already happened. It only happens when
// the user confirms, so a reply like that is replaced with an accurate line.
const ALREADY_DONE = /\b(has|have) been (created|saved|run|started|turned|set|added|removed|queued|prepared for|changed|updated|synced|stopped|paused|archived|enabled|disabled)\b|\b(is|are) now (on|off|active|live|running|halted|enabled|disabled|in your)\b|\bI(?:'|’)ve (created|saved|run|started|turned|set|added|removed|updated|synced|stopped|paused|archived|enabled|disabled)\b/i;

export function proposalReadyLine(p: AgentProposal): string {
  return `${PROPOSAL_TITLES[p.kind]} — ready for your review. Check the details, change anything you like, and confirm.`;
}

/** A reply that says something is prepared / waiting for review. */
const CLAIMS_PREPARED =
  /\b(ready (for (you|your)( to)? review|to review)|review window|(i(?:'|’)ve|i have) (prepared|drafted|set up|created|put together|lined up|queued)|(prepared|drafted) (a|an|the|your) (new )?(strategy|backtest|session|paper|forward test|change|update|limit|watchlist))/i;

/** True when the agent claims it prepared something but no proposal exists — it must not say that. */
export function claimsUnpreparedAction(text: string): boolean {
  return CLAIMS_PREPARED.test(text);
}

export const NOT_PREPARED_NUDGE =
  "You said something is prepared or ready to review, but you did not call a propose_* tool, so nothing was prepared and no review window is open. Call the right propose_* tool now. If you need information from the user first, ask them instead — and don't say anything is ready.";

export const NOT_PREPARED_REPLY = "I wasn't able to prepare that just now. Could you tell me once more exactly what you'd like me to set up?";

export function honestProposalReply(text: string, p: AgentProposal): string {
  return !text.trim() || ALREADY_DONE.test(text) ? proposalReadyLine(p) : text;
}
