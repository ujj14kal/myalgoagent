import { describe, expect, it } from "vitest";
import { looksLikeAdvice } from "./advice-check";

describe("looksLikeAdvice", () => {
  it("flags clear buy/sell calls and predictions", () => {
    expect(looksLikeAdvice("You should buy RELIANCE before results.")).toBe(true);
    expect(looksLikeAdvice("I recommend selling your TCS shares.")).toBe(true);
    expect(looksLikeAdvice("NIFTY is going to rise next week.")).toBe(true);
    expect(looksLikeAdvice("My target price is ₹3,200.")).toBe(true);
  });

  it("leaves explanations and refusals alone", () => {
    expect(looksLikeAdvice("RSI above 70 is often called overbought; you can test an exit rule at 70.")).toBe(false);
    expect(looksLikeAdvice("I can't tell you what to buy or sell, but I can help you backtest the idea.")).toBe(false);
    expect(looksLikeAdvice("A trailing stop follows the price up and exits if it falls by a set amount.")).toBe(false);
  });
});
