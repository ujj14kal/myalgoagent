import { describe, expect, it } from "vitest";
import { keepParams, qEnum, qText } from "./list-query";

describe("list settings from the URL", () => {
  it("trims and caps search text", () => {
    expect(qText("  reliance  ")).toBe("reliance");
    expect(qText(["a", "b"])).toBe("a");
    expect(qText("   ")).toBeUndefined();
    expect(qText("x".repeat(100), 10)).toHaveLength(10);
  });
  it("only accepts listed values", () => {
    expect(qEnum("name", ["new", "name"] as const, "new")).toBe("name");
    expect(qEnum("DROP TABLE", ["new", "name"] as const, "new")).toBe("new");
    expect(qEnum(undefined, ["new"] as const, "new")).toBe("new");
  });
  it("keeps only set values", () => {
    expect(keepParams({ q: "x", sort: undefined, tab: "" })).toEqual({ q: "x" });
  });
});
