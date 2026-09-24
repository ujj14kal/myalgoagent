import { describe, expect, it } from "vitest";
import { honestProposalReply, type AgentProposal } from "./proposals";

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
