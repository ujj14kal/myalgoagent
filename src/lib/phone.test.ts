import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(98765) 43210", "+919876543210"],
    ["+44 7911 123456", "+447911123456"],
  ])("reads %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["", "12345", "5876543210", "+91 12345 67890", "abc", "98765 4321", "+1", "98765 43210 99", null, 5])("refuses %s", (input) => expect(normalizePhone(input)).toBeNull());
});
