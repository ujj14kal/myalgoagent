import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { conditionTruthPerBar, evaluateConditionsPerBar } from "@/lib/strategy/evaluate";
import { parseDsl } from "@/lib/strategy/dsl";
import { NEVER_EXIT_CONDITION, type ConditionNode } from "@/lib/strategy/types";
import { compileWorkspace, connectionLogic, describeLogic } from "./compile";
import type { LogicNode, MemberStrategy, WorkspaceDefinition } from "./types";

const candle = (i: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open: close, high: close, low: close, close, volume: 1 });
const series = (closes: number[]) => closes.map((c, i) => candle(i, c));
const gt = (n: number) => parseDsl(`close > ${n}`);
const lt = (n: number) => parseDsl(`close < ${n}`);

const member = (id: string, entry: ConditionNode, exit: ConditionNode = NEVER_EXIT_CONDITION, over: Partial<MemberStrategy> = {}): MemberStrategy => ({
  id, name: `Strategy ${id}`, mode: "NO_CODE", direction: "LONG", instrumentSymbol: "RELIANCE.NS", timeframe: "1d", entryCondition: entry, exitCondition: exit, ...over,
});
const off = { enabled: false, unit: "PERCENT" as const, value: 0 };
const def = (over: Partial<WorkspaceDefinition> = {}): WorkspaceDefinition => ({
  schema: 1, instrumentId: "i1", direction: "LONG", timeframe: "1d", members: [{ id: "A", strategyId: "sa" }, { id: "B", strategyId: "sb" }],
  entry: { type: "group", connection: "AND", children: [{ type: "strategy", member: "A", rule: "ENTRY" }, { type: "strategy", member: "B", rule: "ENTRY" }] },
  exit: null, positionSizingMode: "FULL_CAPITAL", positionSizingValue: null, stopLoss: { enabled: true, unit: "PERCENT", value: 5 }, target: off, trailingSl: off, maxPyramidEntries: 1, ...over,
});
const strategies = [member("sa", gt(100)), member("sb", lt(120))];

describe("connections mean exactly one thing each", () => {
  // closes:           0   1   2   3   4   5   6   7   8
  const closes = [90, 95, 105, 110, 90, 130, 95, 110, 125];
  const cs = series(closes);
  const A = gt(100); // true on 2,3,5,7,8
  const B = lt(100); // true on 0,1,4,6

  it("AND: both true on the same candle", () => {
    expect(conditionTruthPerBar(cs, connectionLogic("AND", 1, [A, gt(120)]))).toEqual(closes.map((c) => c > 120));
  });
  it("OR: either", () => {
    expect(conditionTruthPerBar(cs, connectionLogic("OR", 1, [gt(120), lt(95)]))).toEqual(closes.map((c) => c > 120 || c < 95));
  });
  it("SEQUENCE: B now, with A having happened in the window BEFORE this candle", () => {
    // A then B within 2 candles
    const t = conditionTruthPerBar(cs, connectionLogic("SEQUENCE", 2, [A, B]));
    expect(t).toEqual([false, false, false, false, true, false, true, false, false]);
    // 4: A at 3 (window 2..3); 6: A at 5; 1: no A before; 0: nothing before.
  });
  it("SEQUENCE of three: A, then B, then C", () => {
    const C = parseDsl("close > 120");
    const t = conditionTruthPerBar(cs, connectionLogic("SEQUENCE", 3, [A, B, C]));
    // C now (5, 8); before it a B (4 for 5; 6 for 8) and before that an A within 3 candles of that B.
    expect(t[5]).toBe(true); // B at 4, A at 3 (within 3 of 4)
    expect(t[8]).toBe(true); // B at 6, A at 5
    expect(t.filter(Boolean)).toHaveLength(2);
  });
  it("CONFIRMATION: the signal, with the others true now or within the window", () => {
    const t = conditionTruthPerBar(cs, connectionLogic("CONFIRMATION", 2, [gt(120), B]));
    // signal on 5 (130) and 8 (125); B within 2 candles: 4 is B (2 back from 5? window 4..5 ✓), 8: window 7..8 has no B.
    expect(t).toEqual([false, false, false, false, false, true, false, false, false]);
  });
  it("VETO: the signal, unless the veto is true now (window 1) ", () => {
    const t = conditionTruthPerBar(cs, connectionLogic("VETO", 1, [A, gt(120)]));
    expect(t).toEqual(closes.map((c) => c > 100 && !(c > 120)));
  });
  it("VETO with a window blocks for as long as the veto was recent", () => {
    const t = conditionTruthPerBar(cs, connectionLogic("VETO", 3, [A, gt(120)]));
    // veto true on 5 and 8 → A is blocked on 5,6,7 and on 8; free on 2,3.
    expect(t).toEqual([false, false, true, true, false, false, false, false, false]);
  });
  it("DEPENDENCY: the prerequisite must have held on every candle of the window", () => {
    const t = conditionTruthPerBar(cs, connectionLogic("DEPENDENCY", 2, [A, gt(105)]));
    // A held on (2,3) → at 3 the dependent (close > 105: 110 ✓) counts; at 8: A held 7,8 and 125 > 105; at 7 A did not hold on 6.
    expect(t).toEqual([false, false, false, true, false, false, false, false, true]);
  });
});

describe("compiling a workspace", () => {
  it("combines the members' rules into the strategy's entry rule", () => {
    const r = compileWorkspace(def(), strategies);
    expect(r.errors).toEqual([]);
    expect(evaluateConditionsPerBar(series([90, 105, 130, 110]), r.entryCondition!, NEVER_EXIT_CONDITION).entry).toEqual([false, true, false, true]); // both hold on candles 1 and 3 (130 fails the < 120 rule)
    expect(r.exitCondition).toEqual(NEVER_EXIT_CONDITION);
  });
  it("uses a strategy's exit rule and inline rules", () => {
    const withExit = [member("sa", gt(100), lt(80)), member("sb", lt(120))];
    const r = compileWorkspace(def({ exit: { type: "group", connection: "OR", children: [{ type: "strategy", member: "A", rule: "EXIT" }, { type: "rule", condition: gt(200), label: "Take-profit level" }] } }), withExit);
    expect(r.errors).toEqual([]);
    expect(r.exitCondition.kind).toBe("group");
  });
  it("describes the logic in words", () => {
    const text = describeLogic(def().entry, [{ id: "A", name: "EMA cross" }, { id: "B", name: "RSI dip" }]);
    expect(text).toBe("(EMA cross's entry rule AND RSI dip's entry rule)");
    expect(describeLogic({ type: "group", connection: "SEQUENCE", bars: 4, children: [{ type: "strategy", member: "A", rule: "ENTRY" }, { type: "strategy", member: "B", rule: "ENTRY" }] }, [{ id: "A", name: "A" }, { id: "B", name: "B" }])).toMatch(/then.*within 4 candles/);
  });
});

describe("what stops a workspace from being published", () => {
  const errs = (d: WorkspaceDefinition, s = strategies) => compileWorkspace(d, s).errors.map((e) => e.message);
  it("no entry logic", () => expect(errs(def({ entry: null }))[0]).toMatch(/no entry logic/));
  it("an empty group", () => expect(errs(def({ entry: { type: "group", connection: "AND", children: [] } })).join(" ")).toMatch(/empty/));
  it("too few rules for a connection", () => expect(errs(def({ entry: { type: "group", connection: "SEQUENCE", children: [{ type: "strategy", member: "A", rule: "ENTRY" }] } })).join(" ")).toMatch(/at least 2/));
  it("a strategy that is gone", () => expect(errs(def(), [member("sa", gt(100))]).join(" ")).toMatch(/can't be found|isn't one of/));
  it("a webhook strategy has no rules", () => expect(errs(def(), [member("sa", gt(100), NEVER_EXIT_CONDITION, { mode: "WEBHOOK" }), member("sb", lt(120))]).join(" ")).toMatch(/TradingView alerts/));
  it("using the exit of a strategy that has none", () => {
    expect(errs(def({ exit: { type: "strategy", member: "A", rule: "EXIT" } })).join(" ")).toMatch(/no exit rule/);
  });
  it("an invalid inline rule", () => {
    const bad = { type: "rule", condition: { kind: "nope" } } as unknown as LogicNode;
    expect(errs(def({ entry: bad })).join(" ")).toMatch(/isn't valid/);
  });
  it("a rule left empty", () => {
    const empty: LogicNode = { type: "rule", condition: gt(0), source: "  " };
    expect(errs(def({ entry: { type: "group", connection: "AND", children: [{ type: "strategy", member: "A", rule: "ENTRY" }, empty] } })).join(" ")).toMatch(/is empty/);
  });
  it("rules that can never be true together", () => {
    const tw = (a: number, b: number): LogicNode => ({ type: "rule", condition: { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: a, endMinute: b } } });
    expect(errs(def({ entry: { type: "group", connection: "AND", children: [tw(555, 570), tw(600, 630)] }, timeframe: "5m", productType: "INTRADAY" })).join(" ")).toMatch(/only one can be true|OR/);
  });
  it("nothing that can close the position", () => {
    expect(errs(def({ stopLoss: off }))[0]).toMatch(/Nothing can close/);
    expect(errs(def({ stopLoss: off, entryPlan: { firstPercent: 100, levels: [], maxHoldDays: 30 } }))).toEqual([]);
  });
  it("sizing by risk needs a stop", () => expect(errs(def({ positionSizingMode: "RISK_PERCENT", positionSizingValue: 1, stopLoss: off, exit: { type: "rule", condition: lt(50) } })).join(" ")).toMatch(/needs a stop-loss/));
  it("targets that sell more than the whole position", () => {
    const t = [{ unit: "PERCENT" as const, value: 5, exitPercent: 60, lock: { mode: "FIXED" as const } }, { unit: "PERCENT" as const, value: 10, exitPercent: 60, lock: { mode: "FIXED" as const } }];
    expect(errs(def({ targets: t })).join(" ")).toMatch(/100%/);
  });
  it("an entry plan that buys more than the plan", () => {
    expect(errs(def({ entryPlan: { firstPercent: 60, levels: [{ trigger: "PULLBACK", unit: "PERCENT", value: 3, allocationPercent: 60 }] } })).join(" ")).toMatch(/100%/);
  });
  it("a swing workspace on intraday candles", () => expect(errs(def({ style: "SWING", timeframe: "15m", productType: "INTRADAY" })).join(" ")).toMatch(/daily candles/));
  it("a short held overnight", () => expect(errs(def({ direction: "SHORT" })).join(" ")).toMatch(/overnight/));
});

describe("warnings do not block", () => {
  it("a strategy built for another direction, an unused strategy, a repeated rule", () => {
    const r = compileWorkspace(def({ members: [{ id: "A", strategyId: "sa" }, { id: "B", strategyId: "sb" }, { id: "C", strategyId: "sc" }], entry: { type: "group", connection: "AND", children: [{ type: "strategy", member: "A", rule: "ENTRY" }, { type: "strategy", member: "A", rule: "ENTRY" }, { type: "strategy", member: "B", rule: "ENTRY" }] } }), [member("sa", gt(100), NEVER_EXIT_CONDITION, { direction: "SHORT" }), member("sb", lt(120)), member("sc", gt(1))]);
    expect(r.errors).toEqual([]);
    const text = r.warnings.map((w) => w.message).join(" | ");
    expect(text).toMatch(/built to sell short/);
    expect(text).toMatch(/not connected/);
    expect(text).toMatch(/twice/);
  });
});
