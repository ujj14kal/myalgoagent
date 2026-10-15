import { describe, expect, it } from "vitest";
import { averageRating, hasPrivateData, publishProblem, shouldHide, validStars, REPORTS_TO_HIDE } from "./community";
import type { CustomIndicatorDef } from "./index";

const plain: CustomIndicatorDef = { type: "formula", formula: "close - sma(close, 20)", pane: "separate" };

describe("publishing", () => {
  it("needs a real description", () => {
    expect(publishProblem(plain, "short")).toMatch(/at least 20/);
    expect(publishProblem(plain, "x".repeat(700))).toMatch(/under 600/);
    expect(publishProblem(plain, "How far price is from its 20-day average, in rupees.")).toBeNull();
  });
  it("refuses anything that carries a private dataset, however deep", () => {
    const withData: CustomIndicatorDef = { ...plain, data: { score: { t: [1, 2], v: [1, 2] } } };
    const wrapped: CustomIndicatorDef = { type: "formula", formula: "ind(a)", pane: "separate", uses: { a: withData } };
    expect(hasPrivateData(plain)).toBe(false);
    expect(hasPrivateData(withData)).toBe(true);
    expect(hasPrivateData(wrapped)).toBe(true);
    expect(publishProblem(wrapped, "A long enough description of what this is.")).toMatch(/private/);
  });
});

describe("ratings and reports", () => {
  it("averages to one decimal and says nothing before anyone rates", () => {
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(13, 3)).toBe(4.3);
  });
  it("accepts only whole stars from 1 to 5", () => {
    expect([1, 3, 5].every(validStars)).toBe(true);
    expect([0, 6, 2.5, "3", null].some(validStars)).toBe(false);
  });
  it("hides after enough different reports", () => {
    expect(shouldHide(REPORTS_TO_HIDE - 1)).toBe(false);
    expect(shouldHide(REPORTS_TO_HIDE)).toBe(true);
  });
});
