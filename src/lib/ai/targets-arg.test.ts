import { describe, expect, it } from "vitest";
import { targetsFrom } from "./targets-arg";
import { describeTargets } from "@/lib/describe-targets";
import { describeExecutionConfig, type StrategyExecutionConfig } from "@/lib/describe-strategy-config";
import { toStrategyInput, type AgentProposal } from "./proposals";

describe("targetsFrom (the agent's targets argument)", () => {
  it("absent stays absent; null clears", () => {
    expect(targetsFrom(undefined)).toBeUndefined();
    expect(targetsFrom(null)).toEqual([]);
  });
  it("reads three fixed-lock targets", () => {
    const t = targetsFrom([
      { value: 5, unit: "PERCENT", exit_percent: 25 },
      { value: 10, unit: "PERCENT", exit_percent: 25, lock: "fixed" },
      { value: 15, unit: "PERCENT", exit_percent: 25 },
    ])!;
    expect(t).toHaveLength(3);
    expect(t[0]).toEqual({ unit: "PERCENT", value: 5, exitPercent: 25, lock: { mode: "FIXED" } });
  });
  it("reads a margin lock, defaulting the margin's unit to the target's", () => {
    const t = targetsFrom([{ value: 40, unit: "POINTS", exit_percent: 50, lock: "margin", margin_value: 5 }])!;
    expect(t[0].lock).toEqual({ mode: "MARGIN", unit: "POINTS", value: 5 });
  });
  it("explains what is wrong, in words the agent can fix", () => {
    expect(() => targetsFrom("5%")).toThrow(/list/);
    expect(() => targetsFrom([{ value: 5, unit: "PERCENT" }])).toThrow(/exit_percent/);
    expect(() => targetsFrom([{ value: 5, unit: "PERCENT", exit_percent: 50, lock: "margin" }])).toThrow(/margin_value/);
    expect(() => targetsFrom([{ value: 5, unit: "PERCENT", exit_percent: 60 }, { value: 10, unit: "PERCENT", exit_percent: 60 }])).toThrow(/100%/);
    expect(() => targetsFrom([{ value: 10, unit: "PERCENT", exit_percent: 25 }, { value: 5, unit: "PERCENT", exit_percent: 25 }])).toThrow(/further/);
    expect(() => targetsFrom([1, 2, 3, 4].map((v) => ({ value: v, unit: "PERCENT", exit_percent: 10 })))).toThrow(/At most 3/);
  });
});

describe("how targets are described", () => {
  const t = targetsFrom([
    { value: 5, unit: "PERCENT", exit_percent: 25 },
    { value: 10, unit: "PERCENT", exit_percent: 25, lock: "margin", margin_value: 1 },
  ])!;
  it("one plain line per target", () => {
    expect(describeTargets(t)).toEqual([
      "Target 1: 5% from entry — sells 25% of the position, then locks the rest at that price",
      "Target 2: 10% from entry — sells 25% of the position, then locks the rest 1% below it",
    ]);
  });
  it("the one-line strategy summary mentions them instead of 'no target'", () => {
    const base: StrategyExecutionConfig = { positionSizingMode: "FULL_CAPITAL", positionSizingValue: null, stopLossEnabled: false, stopLossUnit: null, stopLossValue: null, targetEnabled: false, targetUnit: null, targetValue: null, trailingSlEnabled: false, trailingSlUnit: null, trailingSlValue: null, maxPyramidEntries: 1 };
    const text = describeExecutionConfig({ ...base, targets: t });
    expect(text).toMatch(/2 staged targets/);
    expect(text).not.toMatch(/no target/);
    expect(describeExecutionConfig(base)).toMatch(/no target/);
  });
});

describe("a proposal keeps its targets all the way to the strategy that is saved", () => {
  const draft = {
    name: "Parts",
    instrumentId: "i1",
    instrumentSymbol: "RELIANCE.NS",
    direction: "LONG",
    entrySource: "close > 1",
    exitSource: "close < 1",
    stopLoss: { enabled: false, unit: "PERCENT", value: 0 },
    target: { enabled: false, unit: "PERCENT", value: 0 },
    trailingSl: { enabled: false, unit: "PERCENT", value: 0 },
    targets: targetsFrom([{ value: 5, unit: "PERCENT", exit_percent: 50 }]),
    positionSizingMode: "FULL_CAPITAL",
    positionSizingValue: null,
  } as unknown as Extract<AgentProposal, { kind: "strategy" }>["draft"];
  it("passes them to the strategy input", () => {
    expect(toStrategyInput(draft, "i1").targets).toHaveLength(1);
  });
  it("leaves them out when there are none", () => {
    expect(toStrategyInput({ ...draft, targets: [] }, "i1").targets).toBeUndefined();
  });
});
