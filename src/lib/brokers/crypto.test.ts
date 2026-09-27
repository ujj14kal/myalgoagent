import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

beforeAll(() => {
  process.env.BROKER_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const ctx = { userId: "u1", broker: "dhan", field: "apiSecret" };

describe("broker secret encryption", () => {
  it("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("my-secret-123", ctx);
    expect(stored).not.toContain("my-secret-123");
    expect(decryptSecret(stored, ctx)).toBe("my-secret-123");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", ctx)).not.toBe(encryptSecret("x", ctx));
  });

  it("refuses a ciphertext moved to another user, broker or field", () => {
    const stored = encryptSecret("token", ctx);
    expect(() => decryptSecret(stored, { ...ctx, userId: "u2" })).toThrow();
    expect(() => decryptSecret(stored, { ...ctx, broker: "zerodha" })).toThrow();
    expect(() => decryptSecret(stored, { ...ctx, field: "accessToken" })).toThrow();
  });

  it("refuses a tampered ciphertext", () => {
    const parts = encryptSecret("token", ctx).split(":");
    const body = Buffer.from(parts[3], "base64");
    body[0] ^= 1;
    parts[3] = body.toString("base64");
    expect(() => decryptSecret(parts.join(":"), ctx)).toThrow();
  });
});
