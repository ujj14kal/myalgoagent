import { describe, expect, it } from "vitest";
import { MAX_SLICES, slicePlan } from "./slicing";

const sum = (a: { quantity: number }[]) => a.reduce((s, x) => s + x.quantity, 0);

describe("slicePlan (VWAP-style entry slicing)", () => {
  it("splits the shares exactly, first slice now, the rest later in time order", () => {
    const plan = slicePlan(1003, 5, 9 * 60 + 20)!;
    expect(plan).toHaveLength(5);
    expect(sum(plan)).toBe(1003);
    expect(plan[0].atMinute).toBe(9 * 60 + 20);
    for (let i = 1; i < plan.length; i++) expect(plan[i].atMinute).toBeGreaterThan(plan[i - 1].atMinute);
    expect(Math.max(...plan.map((p) => p.quantity)) - Math.min(...plan.map((p) => p.quantity))).toBeLessThanOrEqual(1);
  });
  it("places slices closer together where the market is busiest (the open) and farther apart midday", () => {
    const plan = slicePlan(800, 8, 9 * 60 + 15)!;
    const gaps = plan.slice(1).map((p, i) => p.atMinute - plan[i].atMinute);
    // The early gaps (busy open) are shorter than the midday ones.
    expect(gaps[0]).toBeLessThan(Math.max(...gaps));
    expect(plan.at(-1)!.atMinute).toBeLessThanOrEqual(15 * 60);
  });
  it("sends it whole when slicing is off, there are too few shares, or the session is nearly over", () => {
    expect(slicePlan(100, 1, 9 * 60 + 20)).toBeNull();
    expect(slicePlan(100, 0, 9 * 60 + 20)).toBeNull();
    expect(slicePlan(3, 5, 9 * 60 + 20)).toBeNull();
    expect(slicePlan(500, 5, 14 * 60 + 55)).toBeNull();
  });
  it("caps the number of slices", () => {
    expect(slicePlan(1000, 50, 9 * 60 + 20)!.length).toBe(MAX_SLICES);
  });
  it("never puts two slices closer than the minimum gap", () => {
    const plan = slicePlan(1000, 8, 14 * 60 + 40)!; // a short window
    if (plan) for (let i = 1; i < plan.length; i++) expect(plan[i].atMinute - plan[i - 1].atMinute).toBeGreaterThanOrEqual(2);
  });
});
