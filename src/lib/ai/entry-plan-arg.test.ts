import { describe, expect, it } from "vitest";
import { entryPlanFrom, styleFrom } from "./entry-plan-arg";
import { describeEntryPlan } from "@/lib/describe-entry-plan";
import { describeExecutionConfig, type StrategyExecutionConfig } from "@/lib/describe-strategy-config";
import { toStrategyInput, type AgentProposal } from "./proposals";

describe("entryPlanFrom (the agent's entry_plan argument)", () => {
  it("absent stays absent; null clears", () => {
    expect(entryPlanFrom(undefined)).toBeUndefined();
    expect(entryPlanFrom(null)).toBeNull();
  });
  it("reads the quarter-now, quarter-each-dip plan", () => {
    const p = entryPlanFrom({ first_percent: 25, levels: [3, 6, 9].map((value) => ({ trigger: "pullback", value, unit: "PERCENT", allocation_percent: 25 })), max_hold_days: 60 })!;
    expect(p.firstPercent).toBe(25);
    expect(p.levels).toHaveLength(3);
    expect(p.levels[0]).toEqual({ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 25 });
    expect(p.maxHoldDays).toBe(60);
  });
  it("works out the first share from what the levels leave", () => {
    expect(entryPlanFrom({ levels: [{ value: 5, unit: "PERCENT", allocation_percent: 40 }] })!.firstPercent).toBe(60);
  });
  it("reads a breakout level and a waiting period", () => {
    const p = entryPlanFrom({ first_percent: 50, levels: [{ trigger: "breakout", value: 4, unit: "POINTS", allocation_percent: 50, max_wait_days: 10 }] })!;
    expect(p.levels[0]).toEqual({ trigger: "BREAKOUT", unit: "POINTS", value: 4, allocationPercent: 50, maxWaitDays: 10 });
  });
  it("explains what is wrong in words the agent can fix", () => {
    expect(() => entryPlanFrom("25%")).toThrow(/object/);
    expect(() => entryPlanFrom({ levels: "x" })).toThrow(/list/);
    expect(() => entryPlanFrom({ levels: [{ trigger: "sideways", value: 3, unit: "PERCENT", allocation_percent: 25 }] })).toThrow(/pullback/);
    expect(() => entryPlanFrom({ levels: [{ value: 3, unit: "PERCENT" }] })).toThrow(/allocation_percent/);
    expect(() => entryPlanFrom({ first_percent: 60, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 60 }] })).toThrow(/100%/);
    expect(() => entryPlanFrom({ first_percent: 25, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 25 }] }, 3)).toThrow(/not both/);
  });
});

describe("styleFrom", () => {
  it("reads the three styles loosely and rejects others", () => {
    expect(styleFrom(undefined)).toBeUndefined();
    expect(styleFrom(null)).toBeNull();
    expect(styleFrom("swing")).toBe("SWING");
    expect(styleFrom("Positional")).toBe("POSITIONAL");
    expect(styleFrom("intraday")).toBe("INTRADAY");
    expect(() => styleFrom("scalping")).toThrow(/intraday/);
  });
});

describe("how a plan is described", () => {
  it("one plain line per entry and one for the holding limit", () => {
    const p = entryPlanFrom({ first_percent: 25, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 25, max_wait_days: 20 }], max_hold_days: 60 })!;
    expect(describeEntryPlan(p)).toEqual([
      "Entry 1: when the entry rule fires, buys 25% of the planned size",
      "Entry 2: when price falls 3% from the first fill, buys 25% of the planned size, withdrawn after 20 days",
      "Closes at the open 60 trading days after the first entry if still open",
    ]);
  });
  it("a short's pullback is a rise", () => {
    const p = entryPlanFrom({ first_percent: 50, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 50 }] })!;
    expect(describeEntryPlan(p, "SHORT")[1]).toBe("Entry 2: when price rises 3% from the first fill, sells short 50% of the planned size");
  });
  it("the one-line strategy summary mentions the plan", () => {
    const base: StrategyExecutionConfig = { positionSizingMode: "FULL_CAPITAL", positionSizingValue: null, stopLossEnabled: false, stopLossUnit: null, stopLossValue: null, targetEnabled: false, targetUnit: null, targetValue: null, trailingSlEnabled: false, trailingSlUnit: null, trailingSlValue: null, maxPyramidEntries: 1 };
    const p = entryPlanFrom({ first_percent: 25, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 25 }], max_hold_days: 30 })!;
    expect(describeExecutionConfig({ ...base, entryPlan: p })).toMatch(/2-step entry plan, closed after 30 days at most/);
    expect(describeExecutionConfig(base)).not.toMatch(/entry plan/);
  });
});

describe("a proposal keeps its plan and style all the way to the strategy that is saved", () => {
  const draft = {
    name: "Dips",
    instrumentId: "i1",
    instrumentSymbol: "HDFCBANK.NS",
    direction: "LONG",
    entrySource: "close > 1",
    exitSource: "close < 1",
    stopLoss: { enabled: false, unit: "PERCENT", value: 0 },
    target: { enabled: false, unit: "PERCENT", value: 0 },
    trailingSl: { enabled: false, unit: "PERCENT", value: 0 },
    style: "SWING",
    entryPlan: entryPlanFrom({ first_percent: 50, levels: [{ value: 3, unit: "PERCENT", allocation_percent: 50 }] }),
    positionSizingMode: "FULL_CAPITAL",
    positionSizingValue: null,
  } as unknown as Extract<AgentProposal, { kind: "strategy" }>["draft"];
  it("passes them to the strategy input", () => {
    const input = toStrategyInput(draft, "i1");
    expect(input.style).toBe("SWING");
    expect(input.entryPlan?.levels).toHaveLength(1);
  });
  it("leaves them out when there are none", () => {
    const input = toStrategyInput({ ...draft, style: null, entryPlan: undefined }, "i1");
    expect(input.style).toBeUndefined();
    expect(input.entryPlan).toBeUndefined();
  });
});
