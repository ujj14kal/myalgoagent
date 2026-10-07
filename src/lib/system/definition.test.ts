import { describe, expect, it } from "vitest";
import { emptySystem, namesInstrument, parseBlockDefinition, parseConceptDefinition, parseSystemDefinition } from "./definition";
import { conceptLogicFrom } from "@/lib/ai/concept-arg";

const bos = { schema: 1, condition: { kind: "signal", signal: { family: "SMC", pattern: "BOS", side: "BULLISH" } } };

describe("layer 1: blocks are only a rule", () => {
  it("accepts a plain component", () => expect(parseBlockDefinition(bos)).not.toBeNull());
  it("rejects a rule that reads another instrument — the trading system chooses instruments", () => {
    const withInstrument = { schema: 1, condition: { kind: "comparison", left: { kind: "price", field: "CLOSE", instrumentSymbol: "TCS.NS" }, operator: "GT", right: { kind: "constant", value: 1 } } };
    expect(namesInstrument(withInstrument.condition)).toBe(true);
    expect(parseBlockDefinition(withInstrument)).toBeNull();
  });
  it("can name the chart it is read on", () => {
    expect(parseBlockDefinition({ ...bos, timeframe: "60m" })!.timeframe).toBe("60m");
    expect(parseBlockDefinition({ ...bos, timeframe: "7m" })!.timeframe).toBeUndefined();
  });
  it("rejects junk", () => {
    expect(parseBlockDefinition({ schema: 1, condition: { kind: "nope" } })).toBeNull();
    expect(parseBlockDefinition({ schema: 2, condition: bos.condition })).toBeNull();
  });
});

describe("layer 2: concepts combine blocks", () => {
  it("keeps connections and optional blocks; drops junk and any per-block timeframe role", () => {
    const d = parseConceptDefinition({ schema: 1, logic: { type: "group", connection: "SEQUENCE", bars: 10.7, children: [{ type: "block", blockId: "a" }, { type: "block", blockId: "b", optional: true, timeframe: "higher" }, { type: "block", blockId: "" }, { type: "group", connection: "NOPE", children: [] }] } });
    expect(d!.logic).toEqual({ type: "group", connection: "SEQUENCE", bars: 10, children: [{ type: "block", blockId: "a" }, { type: "block", blockId: "b", optional: true }] });
    expect(d!.entry).toBeUndefined(); // the default entry (once, when it becomes valid) isn't stored
  });
  it("keeps how the entry is considered", () => {
    const logic = { type: "block", blockId: "a" };
    expect(parseConceptDefinition({ schema: 1, logic, entry: { trigger: "WHILE_VALID", confirmBars: 3.9 } })!.entry).toEqual({ trigger: "WHILE_VALID", confirmBars: 3 });
    expect(parseConceptDefinition({ schema: 1, logic, entry: { trigger: "???", confirmBars: 999 } })!.entry).toEqual({ trigger: "FORMED", confirmBars: 50 });
  });
  it("is read from the agent's words by block name", () => {
    const ids: Record<string, string> = { "my bos": "b1", "my fvg": "b2" };
    const logic = conceptLogicFrom({ connection: "sequence", bars: 5, children: [{ block: "My BOS" }, { block: "My FVG", optional: true }] }, (r) => ids[r.toLowerCase()] ?? null);
    expect(logic).toEqual({ type: "group", connection: "SEQUENCE", bars: 5, children: [{ type: "block", blockId: "b1" }, { type: "block", blockId: "b2", optional: true }] });
    expect(() => conceptLogicFrom({ block: "Missing" }, () => null)).toThrow(/no block "Missing"/);
  });
});

describe("layer 3: trading systems hold every decision", () => {
  it("round-trips a system and repairs bad stored values", () => {
    const sys = { ...emptySystem("inst"), conflict: { rule: "WAIT", confirmBars: 3 }, opposite: { whenLong: "REVERSE", whenShort: "EXIT", confirmBars: 2 }, concepts: [{ conceptId: "c1", enabled: true }, { conceptId: "c1", enabled: false }] };
    const back = parseSystemDefinition(JSON.parse(JSON.stringify(sys)))!;
    expect(back.conflict).toEqual({ rule: "WAIT", confirmBars: 3 });
    expect(back.opposite).toEqual({ whenLong: "REVERSE", whenShort: "EXIT", confirmBars: 2 });
    expect(back.concepts).toHaveLength(1); // one reference per concept
    const bad = parseSystemDefinition({ schema: 2, conflict: { rule: "???" }, opposite: { whenLong: 5 }, capital: { total: "x" } })!;
    expect(bad.conflict.rule).toBe("IGNORE");
    expect(bad.opposite.whenLong).toBe("EXIT");
    expect(bad.capital.total).toBe(100_000);
    expect(parseSystemDefinition({ schema: 1 })).toBeNull();
  });
});
