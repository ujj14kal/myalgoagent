import { describe, expect, it } from "vitest";
import { endOfTurnDelay, isEcho, wordCount } from "./turn-taking";

describe("endOfTurnDelay", () => {
  it("answers quickly after a complete question", () => {
    expect(endOfTurnDelay("How did my RSI strategy do?")).toBeLessThan(500);
  });
  it("answers quickly after a full sentence", () => {
    expect(endOfTurnDelay("Backtest my Reliance strategy for last month.")).toBeLessThan(600);
  });
  it("waits longer when the phrase sounds unfinished", () => {
    expect(endOfTurnDelay("Buy Reliance when RSI crosses and")).toBeGreaterThan(1000);
    expect(endOfTurnDelay("Buy Reliance when the price is above,")).toBeGreaterThan(1000);
    expect(endOfTurnDelay("Buy Reliance when RSI crosses")).toBeGreaterThan(endOfTurnDelay("Buy Reliance when RSI crosses."));
  });
  it("waits a little longer after a very short phrase", () => {
    expect(endOfTurnDelay("Yes.")).toBeGreaterThan(endOfTurnDelay("Yes, please run that backtest now."));
  });
  it("is zero for nothing", () => {
    expect(endOfTurnDelay("  ")).toBe(0);
  });
});

describe("isEcho", () => {
  const spoken = "Your strategy made twelve percent last month. Want me to run it forward on live data?";
  it("recognises the agent's own voice coming back", () => {
    expect(isEcho("your strategy made twelve percent", spoken)).toBe(true);
    expect(isEcho("want me to run it", spoken)).toBe(true);
    expect(isEcho("strategy made twelve percent last month", spoken)).toBe(true);
  });
  it("treats new words as the user talking", () => {
    expect(isEcho("wait", spoken)).toBe(false);
    expect(isEcho("no stop", spoken)).toBe(false);
    expect(isEcho("actually make it Infosys instead", spoken)).toBe(false);
  });
  it("ignores empty transcripts", () => {
    expect(isEcho("", spoken)).toBe(true);
  });
});

describe("wordCount", () => {
  it("counts words, not punctuation", () => {
    expect(wordCount("Hello, world!")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});
