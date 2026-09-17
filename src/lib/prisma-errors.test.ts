import { describe, it, expect } from "vitest";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";

describe("isUniqueConstraintViolation", () => {
  it("recognizes a P2002 violation targeting the given column", () => {
    const err = { code: "P2002", meta: { target: ["userId", "nameNormalized"] } };
    expect(isUniqueConstraintViolation(err, "nameNormalized")).toBe(true);
  });

  it("rejects a P2002 violation on a different column", () => {
    const err = { code: "P2002", meta: { target: ["webhookTokenHash"] } };
    expect(isUniqueConstraintViolation(err, "nameNormalized")).toBe(false);
  });

  it("rejects a non-P2002 Prisma error", () => {
    const err = { code: "P2025", meta: { target: ["nameNormalized"] } };
    expect(isUniqueConstraintViolation(err, "nameNormalized")).toBe(false);
  });

  it("rejects a plain Error instance", () => {
    expect(isUniqueConstraintViolation(new Error("Strategy name is required"), "nameNormalized")).toBe(false);
  });

  it("rejects null/undefined/primitives without throwing", () => {
    expect(isUniqueConstraintViolation(null, "nameNormalized")).toBe(false);
    expect(isUniqueConstraintViolation(undefined, "nameNormalized")).toBe(false);
    expect(isUniqueConstraintViolation("some string", "nameNormalized")).toBe(false);
  });
});
