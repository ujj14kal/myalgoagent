import type { StrategyInput } from "@/lib/strategy-actions";

// An action the agent has prepared for the user to review. Stored on the
// agent's reply (AgentMessage.proposal) so it survives reloads; the status
// records what the user decided.

export type RiskUnitName = "PERCENT" | "POINTS" | "ATR_MULTIPLE";
export type SizingModeName = "FULL_CAPITAL" | "FIXED_QUANTITY" | "FIXED_CAPITAL" | "PERCENT_OF_CAPITAL";
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
        entrySource: string;
        exitSource: string;
        stopLoss: RiskLegDraft;
        target: RiskLegDraft;
        trailingSl: RiskLegDraft;
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
      // Several steps in one review, run in order — e.g. create a strategy, backtest it, paper trade it.
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
  paper_session: "Start paper trading",
  risk_limits: "Update loss limits",
  kill_switch: "Kill switch",
  watchlist_add: "Add to watchlist",
  watchlist_remove: "Remove from watchlist",
  paper_control: "Paper session",
  strategy_archive: "Archive strategy",
  plan: "Multi-step plan",
};

/** A strategy draft as the builder's own input (code mode), for validating and creating it. */
export function toStrategyInput(
  d: Extract<AgentProposal, { kind: "strategy" }>["draft"],
  instrumentId: string
): StrategyInput {
  return {
    name: d.name,
    instrumentId,
    mode: "CODE",
    direction: d.direction,
    entrySource: d.entrySource,
    exitSource: d.exitSource,
    positionSizingMode: d.positionSizingMode,
    positionSizingValue: d.positionSizingValue,
    stopLoss: d.stopLoss,
    target: d.target,
    trailingSl: d.trailingSl,
    maxPyramidEntries: 1,
  };
}

// Phrases that claim a prepared action already happened. It only happens when
// the user confirms, so a reply like that is replaced with an accurate line.
const ALREADY_DONE = /\b(has|have) been (created|saved|run|started|turned|set|added|removed|queued|prepared for|changed|updated|synced|stopped|paused|archived|enabled|disabled)\b|\b(is|are) now (on|off|active|live|running|halted|enabled|disabled|in your)\b|\bI(?:'|’)ve (created|saved|run|started|turned|set|added|removed|updated|synced|stopped|paused|archived|enabled|disabled)\b/i;

export function proposalReadyLine(p: AgentProposal): string {
  return `${PROPOSAL_TITLES[p.kind]} — ready for your review. Check the details, change anything you like, and confirm.`;
}

export function honestProposalReply(text: string, p: AgentProposal): string {
  return !text.trim() || ALREADY_DONE.test(text) ? proposalReadyLine(p) : text;
}
