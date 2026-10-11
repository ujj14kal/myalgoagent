import { describe, expect, it } from "vitest";
import { extractRule, checkRule, writeRule } from "./rule-code";

describe("extractRule", () => {
  it("takes the code block, or the first line, without quotes", () => {
    expect(extractRule("```\nsma(20) crossesAbove ema(50)\n```")).toBe("sma(20) crossesAbove ema(50)");
    expect(extractRule('"rsi(14) < 30"')).toBe("rsi(14) < 30");
    expect(extractRule("Here is the rule:\nclose > sma(20);")).toBe("close > sma(20)");
    expect(extractRule("```js\nclose > sma(20)\n```\nThis buys above the average.")).toBe("close > sma(20)");
  });
});

describe("checkRule", () => {
  it("accepts a valid rule and says where an invalid one goes wrong", () => {
    expect(checkRule("sma(20) crossesAbove ema(50) and rsi(14) < 70")).toBeNull();
    expect(checkRule("sma(20) crossesAbove")).toMatch(/line 1/);
    expect(checkRule("magic(3) > 4")).toMatch(/Unknown identifier/);
  });
});

describe("writeRule", () => {
  it("returns a rule that parses", async () => {
    const r = await writeRule(async () => "rsi(14) < 30", { description: "oversold", part: "entry" });
    expect(r).toEqual({ ok: true, code: "rsi(14) < 30", retried: false });
  });
  it("shows the model the parser's complaint once and uses the corrected answer", async () => {
    const seen: string[] = [];
    const answers = ["rsi(14) <", "rsi(14) < 30"];
    const r = await writeRule(async (_s, u) => (seen.push(u), answers.shift()!), { description: "oversold", part: "entry" });
    expect(r).toEqual({ ok: true, code: "rsi(14) < 30", retried: true });
    expect(seen[1]).toMatch(/parser rejected it/);
  });
  it("gives up with a plain message after two bad answers", async () => {
    const r = await writeRule(async () => "nonsense(", { description: "x", part: "exit" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Couldn't write a rule that parses/);
  });
});
