import { describe, expect, it } from "vitest";
import { capitalProblem } from "./capital";

describe("capitalProblem", () => {
  it("is fine when the capital covers the position", () => {
    expect(capitalProblem({ mode: "FIXED_QUANTITY", value: 1 }, 5000, 295, "TARIL")).toBeNull();
    expect(capitalProblem({ mode: "FULL_CAPITAL", value: null }, 300, 295, "TARIL")).toBeNull();
  });
  it("explains a capital too small for even one share (the TARIL ₹250 case)", () => {
    const msg = capitalProblem({ mode: "FIXED_QUANTITY", value: 1 }, 250, 295, "TARIL");
    expect(msg).toContain("₹250 isn't enough");
    expect(msg).toContain("at least ₹295");
  });
  it("needs the full fixed quantity, not just one share", () => {
    expect(capitalProblem({ mode: "FIXED_QUANTITY", value: 5 }, 700, 295, "TARIL")).toContain("at least ₹1,475");
  });
  it("handles per-trade amounts and percent of capital", () => {
    expect(capitalProblem({ mode: "FIXED_CAPITAL", value: 200 }, 5000, 295, "TARIL")).toContain("less than one TARIL share");
    expect(capitalProblem({ mode: "PERCENT_OF_CAPITAL", value: 10 }, 1000, 295, "TARIL")).toContain("at least ₹2,950");
    expect(capitalProblem({ mode: "PERCENT_OF_CAPITAL", value: 10 }, 3000, 295, "TARIL")).toBeNull();
  });
});
