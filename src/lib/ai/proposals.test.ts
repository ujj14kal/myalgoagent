import { describe, expect, it } from "vitest";
import { claimsUnpreparedAction, honestProposalReply, type AgentProposal } from "./proposals";

const kill: AgentProposal = { kind: "kill_switch", status: "pending", draft: { enabled: true } };

describe("honestProposalReply", () => {
  it("replaces replies that claim the action already happened", () => {
    expect(honestProposalReply("The global kill switch has been turned on.", kill)).toMatch(/ready for your review/);
    expect(honestProposalReply("I've created your strategy!", kill)).toMatch(/ready for your review/);
    expect(honestProposalReply("Trading is now halted.", kill)).toMatch(/ready for your review/);
  });

  it("keeps accurate replies", () => {
    const ok = "The kill switch is ready for your review — confirm to halt new positions.";
    expect(honestProposalReply(ok, kill)).toBe(ok);
  });
});

describe("claimsUnpreparedAction", () => {
  it("catches claims that something is ready", () => {
    expect(claimsUnpreparedAction("Your short-sell strategy for Reliance is ready for you to review.")).toBe(true);
    expect(claimsUnpreparedAction("Sure, I've prepared a new strategy for HDFC Bank.")).toBe(true);
    expect(claimsUnpreparedAction("I have set up the backtest.")).toBe(true);
  });
  it("leaves ordinary answers and questions alone", () => {
    expect(claimsUnpreparedAction("RSI measures momentum on a 0–100 scale.")).toBe(false);
    expect(claimsUnpreparedAction("Which stock should I use for this strategy?")).toBe(false);
    expect(claimsUnpreparedAction("You can review your backtests on the Backtests page.")).toBe(false);
  });
});
