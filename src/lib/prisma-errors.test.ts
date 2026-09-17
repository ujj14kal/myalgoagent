import { describe, it, expect } from "vitest";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";

describe("isUniqueConstraintViolation", () => {
  it("recognizes a P2002 violation targeting the given column (documented meta.target array shape)", () => {
    const err = { code: "P2002", meta: { target: ["userId", "nameNormalized"] } };
    expect(isUniqueConstraintViolation(err, "nameNormalized")).toBe(true);
  });

  it("recognizes a P2002 violation via meta.target as a single string", () => {
    const err = { code: "P2002", meta: { target: "nameNormalized" } };
    expect(isUniqueConstraintViolation(err, "nameNormalized")).toBe(true);
  });

  // This exact shape was captured by reproducing a real duplicate-name
  // insert against this project's live database (Prisma 7.10.0, the
  // driver-adapter architecture) — meta comes back empty, not populated
  // the way Prisma's own docs describe. Without this case, the original
  // implementation silently never matched a real production error.
  it("recognizes a P2002 violation when meta is empty and only the message names the constraint (real Prisma 7.10.0 shape)", () => {
    const err = {
      code: "P2002",
      meta: {},
      message:
        "\nInvalid `prisma.strategy.create()` invocation\nUnique constraint failed on the constraint: `Strategy_userId_nameNormalized_key`",
    };
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
