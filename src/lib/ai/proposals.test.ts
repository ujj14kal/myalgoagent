import { describe, expect, it } from "vitest";
import { claimsUnpreparedAction } from "./proposals";

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
