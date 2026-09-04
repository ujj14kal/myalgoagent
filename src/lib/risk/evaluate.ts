export type RiskEventType = "KILL_SWITCH_BLOCKED" | "MAX_LOSS_HIT" | "MAX_CONSECUTIVE_LOSSES_HIT";

export interface RiskContext {
  killSwitchEnabled: boolean;
  maxLossPercent: number | null;
  maxConsecutiveLosses: number | null;
}

export interface RiskCheckInput {
  startingCapital: number;
  currentEquity: number;
  /** Closed-trade net P&Ls, most-recent-first. */
  recentNetPnls: number[];
}

export interface RiskCheckResult {
  allowNewEntries: boolean;
  breach?: { type: RiskEventType; message: string };
}

function leadingLossStreak(recentNetPnls: number[]): number {
  let streak = 0;
  for (const pnl of recentNetPnls) {
    if (pnl < 0) streak++;
    else break;
  }
  return streak;
}

export function evaluateRisk(input: RiskCheckInput, risk: RiskContext): RiskCheckResult {
  if (risk.killSwitchEnabled) {
    return { allowNewEntries: false };
  }

  if (risk.maxLossPercent !== null) {
    const lossPercent = ((input.startingCapital - input.currentEquity) / input.startingCapital) * 100;
    if (lossPercent >= risk.maxLossPercent) {
      return {
        allowNewEntries: false,
        breach: {
          type: "MAX_LOSS_HIT",
          message: `Loss of ${lossPercent.toFixed(2)}% reached the configured limit of ${risk.maxLossPercent}%.`,
        },
      };
    }
  }

  if (risk.maxConsecutiveLosses !== null) {
    const streak = leadingLossStreak(input.recentNetPnls);
    if (streak >= risk.maxConsecutiveLosses) {
      return {
        allowNewEntries: false,
        breach: {
          type: "MAX_CONSECUTIVE_LOSSES_HIT",
          message: `${streak} consecutive losing trades reached the configured limit of ${risk.maxConsecutiveLosses}.`,
        },
      };
    }
  }

  return { allowNewEntries: true };
}
