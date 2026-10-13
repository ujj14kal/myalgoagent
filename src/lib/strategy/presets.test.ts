import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { validateConditionNode } from "./validate";
import { checkConditionFeasibility } from "./validate-sanity";

describe("strategy presets from the analyst studies", () => {
  it("has unique ids and plain-words summaries", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS.every((p) => p.summary.length > 60 && p.name.length > 5)).toBe(true);
  });
  for (const p of PRESETS) {
    it(`${p.id}: entry and exit are valid rules that can fire`, () => {
      expect(() => validateConditionNode(p.entry, "entry")).not.toThrow();
      expect(() => validateConditionNode(p.exit, "exit")).not.toThrow();
      expect(checkConditionFeasibility(p.entry, "entry")).toEqual([]);
      expect(checkConditionFeasibility(p.exit, "exit")).toEqual([]);
    });
    it(`${p.id}: intraday presets use an intraday timeframe and square-off`, () => {
      if (p.product === "INTRADAY") {
        expect(["1m", "3m", "5m", "15m", "30m", "60m", "4h"]).toContain(p.timeframe);
        expect(p.squareOffMinute).toBeGreaterThan(0);
      } else {
        expect(["1d", "1wk"]).toContain(p.timeframe);
      }
    });
  }
});
