import { describe, expect, it } from "vitest";
import { logicFrom } from "./workspace-arg";

const memberOf = (ref: string) => ({ "ema cross": "A", a: "A", "rsi dip": "B", b: "B" })[ref.toLowerCase()] ?? null;

describe("logicFrom (the agent's workspace logic)", () => {
  it("reads strategy rules, rules of your own and groups", () => {
    const n = logicFrom({ connection: "confirmation", bars: 3, children: [{ strategy: "EMA cross" }, { strategy: "rsi dip", rule: "entry" }, { condition: "close > 100", label: "Price floor" }] }, memberOf);
    expect(n).toMatchObject({ type: "group", connection: "CONFIRMATION", bars: 3 });
    if (n.type !== "group") throw new Error();
    expect(n.children[0]).toEqual({ type: "strategy", member: "A", rule: "ENTRY" });
    expect(n.children[1]).toEqual({ type: "strategy", member: "B", rule: "ENTRY" });
    expect(n.children[2]).toMatchObject({ type: "rule", label: "Price floor", condition: { kind: "comparison", operator: "GT" } });
  });
  it("a bare list is an AND group", () => {
    expect(logicFrom([{ strategy: "A" }, { strategy: "B" }], memberOf)).toMatchObject({ type: "group", connection: "AND", children: [{ member: "A" }, { member: "B" }] });
  });
  it("reads exit rules and nesting", () => {
    const n = logicFrom({ connection: "OR", children: [{ strategy: "A", rule: "exit" }, { connection: "SEQUENCE", children: [{ strategy: "A" }, { strategy: "B" }] }] }, memberOf);
    if (n.type !== "group") throw new Error();
    expect(n.children[0]).toEqual({ type: "strategy", member: "A", rule: "EXIT" });
    expect(n.children[1]).toMatchObject({ type: "group", connection: "SEQUENCE" });
  });
  it("says what is wrong and where", () => {
    expect(() => logicFrom({ strategy: "Nope" }, memberOf)).toThrow(/isn't one of the workspace's strategies/);
    expect(() => logicFrom({ connection: "MAYBE", children: [{ strategy: "A" }] }, memberOf)).toThrow(/connection must be one of/);
    expect(() => logicFrom({ connection: "AND", children: [] }, memberOf)).toThrow(/non-empty/);
    expect(() => logicFrom({ strategy: "A", rule: "sometimes" }, memberOf)).toThrow(/entry.*exit/);
    expect(() => logicFrom({ hello: 1 }, memberOf)).toThrow(/needs/);
    expect(() => logicFrom({ condition: "not a rule at all !!" }, memberOf)).toThrow();
    expect(() => logicFrom("x", memberOf)).toThrow(/expected an object/);
  });
  it("bounds depth and size", () => {
    let deep: unknown = { strategy: "A" };
    for (let i = 0; i < 10; i++) deep = { connection: "AND", children: [deep] };
    expect(() => logicFrom(deep, memberOf)).toThrow(/too deeply/);
  });
});
