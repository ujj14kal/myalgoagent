import { describe, expect, it } from "vitest";
import { compileConcept, compileSystem, conceptProblems, describeConcept, onTimeframe, blockProblems } from "./compile";
import type { BlockDefinition, ConceptSnapshot, TradingSystemDefinition } from "./types";
import { DEFAULT_RISK_OPTIONS } from "@/lib/trading-engine/risk-options";
import type { ConditionNode } from "@/lib/strategy/types";

const smc = (pattern: string, side = "BULLISH"): BlockDefinition => ({ schema: 1, condition: { kind: "signal", signal: { family: "SMC", pattern, side } } as ConditionNode });
const rsiAbove = (n: number): BlockDefinition => ({ schema: 1, condition: { kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14] }, operator: "GT", right: { kind: "constant", value: n } } });
const blocks = { sweep: { name: "My liquidity sweep", definition: smc("LIQUIDITY_SWEEP") }, bos: { name: "My BOS", definition: smc("BOS") }, fvg: { name: "My FVG", definition: smc("FVG") }, retest: { name: "My FVG retest", definition: smc("FVG_RETEST") }, trend: { name: "HTF trend up", definition: rsiAbove(50) }, bearBos: { name: "Bearish BOS", definition: smc("BOS", "BEARISH") } };

// "My Bullish SMC Entry": Liquidity Sweep → BOS → FVG → FVG retest, in order, each within 10 candles.
const bullishSmc: ConceptSnapshot = {
  id: "c1",
  name: "My Bullish SMC Entry",
  classification: "BULLISH",
  blocks,
  definition: {
    schema: 1,
    logic: {
      type: "group",
      connection: "SEQUENCE",
      bars: 10,
      children: [{ type: "block", blockId: "sweep" }, { type: "block", blockId: "bos" }, { type: "block", blockId: "fvg" }, { type: "block", blockId: "retest" }, { type: "block", blockId: "trend", optional: true, timeframe: "higher" }],
    },
  },
};
const bearishSmc: ConceptSnapshot = { id: "c2", name: "My Bearish Reversal", classification: "BEARISH", blocks, definition: { schema: 1, logic: { type: "block", blockId: "bearBos" } } };

const system = (over: Partial<TradingSystemDefinition> = {}): TradingSystemDefinition => ({
  schema: 2,
  concepts: [{ conceptId: "c1", enabled: true }, { conceptId: "c2", enabled: true }],
  instrumentType: "STOCK",
  instrumentId: "inst",
  timeframes: { primary: "5m", confirmation: "15m", higher: "60m" },
  productType: "INTRADAY",
  sessions: { noEntryAfterMinute: 14 * 60 + 30, squareOffMinute: 15 * 60 + 15, entryWindows: [], noTradeWindows: [] },
  capital: { total: 100_000, maxUtilizationPercent: 100 },
  positionSizingMode: "RISK_PERCENT",
  positionSizingValue: 1,
  riskOptions: { ...DEFAULT_RISK_OPTIONS, leverage: 5 },
  stopLoss: { enabled: true, unit: "PERCENT", value: 0.5 },
  target: { enabled: false, unit: "PERCENT", value: 0 },
  trailingSl: { enabled: false, unit: "PERCENT", value: 0 },
  targets: [],
  entryPlan: null,
  maxPyramidEntries: 1,
  conflict: { rule: "FIRST", confirmBars: 1 },
  opposite: { whenLong: "REVERSE", whenShort: "REVERSE", confirmBars: 0 },
  orderType: "MARKET",
  limitMode: null,
  limitValue: null,
  ...over,
});

describe("blocks", () => {
  it("are plain rules, checked like the builder's", () => {
    expect(blockProblems(smc("BOS"))).toEqual([]);
    expect(blockProblems({ schema: 1, condition: { kind: "signal", signal: { family: "SMC", pattern: "NOPE", side: "BULLISH" } } as never }, "My BOS")[0].message).toMatch(/My BOS isn't a valid rule/);
  });
  it("can be read on another timeframe without touching ones that name their own", () => {
    const c: ConditionNode = { kind: "group", op: "AND", children: [rsiAbove(50).condition, { kind: "signal", signal: { family: "SMC", pattern: "BOS", side: "BULLISH", timeframe: "1d" } }, { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 600 } }] };
    const r = onTimeframe(c, "60m") as Extract<ConditionNode, { kind: "group" }>;
    expect((r.children[0] as Extract<ConditionNode, { kind: "comparison" }>).left).toMatchObject({ timeframe: "60m" });
    expect((r.children[1] as Extract<ConditionNode, { kind: "signal" }>).signal).toMatchObject({ timeframe: "1d" });
    expect((r.children[2] as Extract<ConditionNode, { kind: "signal" }>).signal).not.toHaveProperty("timeframe");
  });
});

describe("concepts", () => {
  it("compile the sequence; optional blocks go to confidence, on their timeframe role", () => {
    const { runtime, issues } = compileConcept(bullishSmc, { primary: "5m", confirmation: "15m", higher: "60m" });
    expect(issues).toEqual([]);
    expect(runtime!.side).toBe("BULLISH");
    expect(runtime!.optionals).toHaveLength(1);
    expect(runtime!.timeframeRank).toBe(2);
    expect(JSON.stringify(runtime!.optionals[0])).toContain('"timeframe":"60m"');
    expect(JSON.stringify(runtime!.condition)).not.toContain("RSI"); // the optional trend filter doesn't decide validity
  });
  it("need the system to set a timeframe a block is read on", () => {
    expect(compileConcept(bullishSmc, { primary: "5m", confirmation: null, higher: null }).issues[0].message).toMatch(/higher timeframe/);
  });
  it("explain what's wrong", () => {
    expect(conceptProblems({ schema: 1, logic: null }, blocks)[0].message).toMatch(/no blocks yet/);
    expect(conceptProblems({ schema: 1, logic: { type: "group", connection: "AND", children: [{ type: "block", blockId: "bos", optional: true }] } }, blocks)[0].message).toMatch(/optional/);
    expect(conceptProblems({ schema: 1, logic: { type: "group", connection: "SEQUENCE", children: [{ type: "block", blockId: "bos" }] } }, blocks)[0].message).toMatch(/at least 2/);
    expect(conceptProblems({ schema: 1, logic: { type: "block", blockId: "gone" } }, blocks)[0].message).toMatch(/no longer exists/);
  });
  it("read as one sentence", () => {
    expect(describeConcept(bullishSmc.definition, blocks)).toBe("My liquidity sweep → My BOS → My FVG → My FVG retest (each within 10 candles); optional: HTF trend up (higher timeframe) [optional]");
  });
});

describe("trading systems", () => {
  it("compile bullish and bearish concepts into the two-way runtime", () => {
    const c = compileSystem(system(), [bullishSmc, bearishSmc]);
    expect(c.errors).toEqual([]);
    expect(c.runtime!.concepts.map((x) => x.side)).toEqual(["BULLISH", "BEARISH"]);
    expect(c.runtime!.allowShort).toBe(true);
    expect(c.longEntry).not.toBeNull();
    expect(c.shortEntry).not.toBeNull();
  });
  it("delivery systems can't short: bearish concepts only close longs, and need a bullish one", () => {
    const c = compileSystem(system({ productType: "DELIVERY", timeframes: { primary: "1d", confirmation: null, higher: "1wk" }, riskOptions: DEFAULT_RISK_OPTIONS }), [bullishSmc, bearishSmc]);
    expect(c.shortEntry).toBeNull();
    expect(c.runtime!.allowShort).toBe(false);
    expect(c.warnings.some((w) => /can't go short/.test(w.message))).toBe(true);
    const onlyBear = compileSystem(system({ productType: "DELIVERY", timeframes: { primary: "1d", confirmation: null, higher: null }, riskOptions: DEFAULT_RISK_OPTIONS, concepts: [{ conceptId: "c2", enabled: true }] }), [bearishSmc]);
    expect(onlyBear.errors.some((e) => /bullish concept/.test(e.message))).toBe(true);
  });
  it("checks every system decision", () => {
    const c = compileSystem(system({ concepts: [], instrumentId: "", capital: { total: 0, maxUtilizationPercent: 150 }, stopLoss: { enabled: false, unit: "PERCENT", value: 0 }, sessions: { noEntryAfterMinute: null, squareOffMinute: null, entryWindows: [{ startMinute: 600, endMinute: 590 }], noTradeWindows: [] }, conflict: { rule: "WAIT", confirmBars: 0 } }), []);
    const text = c.errors.map((e) => e.message).join(" | ");
    for (const want of [/at least one concept/, /instrument/, /capital this system/, /between 1% and 100%/, /Sizing by risk needs a stop-loss/, /must end after it starts/, /at least 1 candle/]) expect(text).toMatch(want);
    expect(c.runtime).toBeNull();
  });
});
