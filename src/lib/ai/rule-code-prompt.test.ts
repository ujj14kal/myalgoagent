import { describe, expect, it } from "vitest";
import { rulePrompt, RULE_CODE_SYSTEM } from "./rule-code";

describe("rule writer prompt", () => {
  it("passes the rule already in the editor as plain data, not as an instruction", () => {
    const p = rulePrompt({ description: "take entry when rsi is at 50", part: "entry", current: "sma(20) crossesAbove ema(50)" });
    expect(p).toContain("Current rule: sma(20) crossesAbove ema(50)");
    // The phrase "change it only as asked" made the safety filter read the request as a prompt attack and block it.
    expect(p).not.toMatch(/change it only/i);
    expect(RULE_CODE_SYSTEM).toContain("Current rule");
  });
});
