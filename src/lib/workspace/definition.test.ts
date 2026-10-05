import { describe, expect, it } from "vitest";
import { emptyDefinition, LIMITS, parseDefinition, usedMembers } from "./definition";
import { strategyInputFor } from "./input";
import { NEVER_EXIT_CONDITION } from "@/lib/strategy/types";
import { parseDsl } from "@/lib/strategy/dsl";

describe("parseDefinition", () => {
  it("round-trips a plan", () => {
    const def = { ...emptyDefinition("i1"), members: [{ id: "A", strategyId: "s1" }], entry: { type: "group" as const, connection: "SEQUENCE" as const, bars: 4, children: [{ type: "strategy" as const, member: "A", rule: "ENTRY" as const }, { type: "rule" as const, condition: parseDsl("rsi(14) > 40"), label: "RSI" }] } };
    expect(parseDefinition(JSON.parse(JSON.stringify(def)))).toEqual(expect.objectContaining({ instrumentId: "i1", members: def.members, entry: def.entry }));
  });
  it("refuses what is not a plan", () => {
    expect(parseDefinition(null)).toBeNull();
    expect(parseDefinition({ schema: 2 })).toBeNull();
    expect(parseDefinition("x")).toBeNull();
  });
  it("repairs rather than trusts: bad nodes are dropped, odd values defaulted", () => {
    const d = parseDefinition({ schema: 1, instrumentId: "i", direction: "SIDEWAYS", entry: { type: "group", connection: "AND", children: [{ type: "strategy", member: "A", rule: "WHENEVER" }, { type: "rule", condition: { kind: "nope" } }, { type: "strategy", member: "B", rule: "EXIT" }] }, positionSizingMode: "ALL_IN", maxPyramidEntries: 0 })!;
    expect(d.direction).toBe("LONG");
    expect(d.positionSizingMode).toBe("FULL_CAPITAL");
    expect(d.maxPyramidEntries).toBe(1);
    expect(d.entry).toMatchObject({ type: "group", children: [{ type: "strategy", member: "B", rule: "EXIT" }] });
  });
  it("bounds the size of a plan", () => {
    const many = Array.from({ length: LIMITS.members + 10 }, (_, i) => ({ id: `M${i}`, strategyId: `s${i}` }));
    expect(parseDefinition({ ...emptyDefinition("i"), members: many })!.members).toHaveLength(LIMITS.members);
    let deep: unknown = { type: "strategy", member: "A", rule: "ENTRY" };
    for (let i = 0; i < LIMITS.depth + 3; i++) deep = { type: "group", connection: "AND", children: [deep] };
    // too deep: the deepest levels are cut off
    const parsed = parseDefinition({ ...emptyDefinition("i"), entry: deep })!;
    expect(usedMembers(parsed.entry)).toEqual([]);
    expect(parseDefinition({ ...emptyDefinition("i"), entry: { type: "rule", condition: parseDsl("close > 1"), label: "x".repeat(LIMITS.bytes) } })).toBeNull();
  });
  it("lists the strategies a plan uses", () => {
    expect(usedMembers({ type: "group", connection: "AND", children: [{ type: "strategy", member: "A", rule: "ENTRY" }, { type: "group", connection: "OR", children: [{ type: "strategy", member: "B", rule: "EXIT" }, { type: "rule", condition: parseDsl("close > 1") }] }] })).toEqual(["A", "B"]);
  });
});

describe("the strategy a version compiles to", () => {
  it("carries the whole plan over", () => {
    const def = { ...emptyDefinition("i1"), style: "SWING" as const, entryPlan: { firstPercent: 50, levels: [{ trigger: "PULLBACK" as const, unit: "PERCENT" as const, value: 3, allocationPercent: 50 }] }, targets: [{ unit: "PERCENT" as const, value: 5, exitPercent: 50, lock: { mode: "FIXED" as const } }], positionSizingMode: "RISK_PERCENT" as const, positionSizingValue: 1 };
    const input = strategyInputFor(def, parseDsl("close > 1"), NEVER_EXIT_CONDITION, "Plan · v1");
    expect(input).toMatchObject({ name: "Plan · v1", mode: "NO_CODE", timeframe: "1d", productType: "DELIVERY", style: "SWING", positionSizingMode: "RISK_PERCENT", orderType: "MARKET", limitValue: null });
    expect(input.entryPlan?.levels).toHaveLength(1);
    expect(input.targets).toHaveLength(1);
  });
  it("derives the product from the timeframe when none is set", () => {
    const def = { ...emptyDefinition("i1"), timeframe: "15m", productType: undefined };
    expect(strategyInputFor(def, parseDsl("close > 1"), NEVER_EXIT_CONDITION, "x").productType).toBe("INTRADAY");
  });
});
