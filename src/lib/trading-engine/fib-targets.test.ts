import { describe, expect, it } from "vitest";
import { targetPrice, validateTargets, type TargetLevel } from "./step";
import { parseTargets, targetsToStore } from "./targets-config";
import { describeTargets } from "@/lib/describe-targets";
import { targetsFrom } from "@/lib/ai/targets-arg";
import { rowsToTargets, targetsToRows } from "@/components/staged-targets-fields";

const fibLevel = (ratio: number): TargetLevel => ({ unit: "POINTS", value: ratio, fibExtension: ratio, exitPercent: 50, lock: { mode: "BREAKEVEN" } });

describe("Fibonacci-extension targets", () => {
  it("price = swing start + ratio x swing size (the study's 100 -> 200 example)", () => {
    const swing = { start: 100, end: 200 };
    expect(targetPrice(fibLevel(1.272), 170, undefined, "LONG", null, swing)).toBeCloseTo(227.2, 6);
    expect(targetPrice(fibLevel(1.618), 170, undefined, "LONG", null, swing)).toBeCloseTo(261.8, 6);
  });
  it("has no price without a swing, in the wrong direction, or on the wrong side of the entry", () => {
    expect(targetPrice(fibLevel(1.272), 170, undefined, "LONG", null, undefined)).toBeNull();
    expect(targetPrice(fibLevel(1.272), 170, undefined, "LONG", null, { start: 200, end: 100 })).toBeNull(); // down-swing for a long
    expect(targetPrice(fibLevel(1.272), 250, undefined, "LONG", null, { start: 100, end: 200 })).toBeNull(); // entry already above the target
    expect(targetPrice(fibLevel(1.272), 150, undefined, "SHORT", null, { start: 200, end: 100 })).toBeCloseTo(72.8, 6); // a short mirrors
  });
  it("leaves ordinary targets exactly as they were", () => {
    const plain: TargetLevel = { unit: "PERCENT", value: 5, exitPercent: 50, lock: { mode: "FIXED" } };
    expect(targetPrice(plain, 100, undefined, "LONG", null, { start: 1, end: 2 })).toBeCloseTo(105, 10);
  });
  it("must be above 1", () => {
    expect(validateTargets([fibLevel(1.272)])).toBeNull();
    expect(validateTargets([{ ...fibLevel(0.8), fibExtension: 0.8 }])).toMatch(/above 1/);
  });
  it("survives saving and reading back, in words, in the form and from the agent", () => {
    const stored = targetsToStore([fibLevel(1.272), fibLevel(1.618)], false).json!;
    expect(parseTargets(stored).map((t) => t.fibExtension)).toEqual([1.272, 1.618]);
    expect(describeTargets(parseTargets(stored))[0]).toMatch(/1.272 Fibonacci extension/);
    expect(rowsToTargets(targetsToRows(stored))).toEqual(stored);
    const fromAgent = targetsFrom([{ value: 1, unit: "PERCENT", fib_extension: 1.272, exit_percent: 50, lock: "breakeven" }])!;
    expect(fromAgent[0].fibExtension).toBe(1.272);
    expect(() => targetsFrom([{ value: 1, unit: "PERCENT", fib_extension: 0.9, exit_percent: 50 }])).toThrow(/above 1/);
  });
});

describe("Fibonacci targets run in the engine", () => {
  it("validates the order and margin rules without comparing a ratio with a distance", () => {
    expect(validateTargets([fibLevel(1.272), fibLevel(1.618)])).toBeNull();
    expect(validateTargets([fibLevel(1.618), fibLevel(1.272)])).toMatch(/further/);
    expect(validateTargets([{ ...fibLevel(1.272), lock: { mode: "MARGIN", unit: "POINTS", value: 5 } }])).toBeNull();
    expect(validateTargets([{ unit: "POINTS", value: 10, exitPercent: 25, lock: { mode: "FIXED" } }, fibLevel(1.272)])).toBeNull();
  });
});
