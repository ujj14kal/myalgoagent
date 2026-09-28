import { describe, expect, it } from "vitest";
import { cleanKey, KeyInputError } from "./keys";

const GROWW_JWT =
  "eyJraWQiOiJaTUtjVXciLCJhbGciOiJFUzI1NiJ9." + "eyJ" + "a".repeat(700) + "." + "b".repeat(86) + "_-";

describe("cleanKey accepts real broker key formats", () => {
  it.each([
    ["Groww API key (JWT, ~850 chars)", GROWW_JWT],
    ["ICICI Breeze secret with symbols", "41x9~73V7g@5p#k=Q2"],
    ["Fyers app id", "XA1B2C3D4E-100"],
    ["Upstox key (uuid)", "2b8f4c1e-9a7d-4e3b-8c2a-1f0e9d8c7b6a"],
    ["Zerodha key", "abc123xyz789"],
    ["Alice Blue secret", "Zx9Ab8Cd7Ef6Gh5Ij4Kl3Mn2Op1Qr0St"],
  ])("%s", (_, key) => {
    expect(cleanKey(key, "API key")).toBe(key);
  });

  it("strips invisible characters and wrapping quotes from a paste", () => {
    expect(cleanKey("​  abc123xyz789﻿ ", "API key")).toBe("abc123xyz789");
    expect(cleanKey('"abc123xyz789"', "API key")).toBe("abc123xyz789");
  });
});

describe("cleanKey rejects what can't be a key", () => {
  it.each([
    ["empty", "", /Please paste/],
    ["not a string", 42, /Please paste/],
    ["internal space", "abc 123", /space or line break/],
    ["line break", "abc\n123", /space or line break/],
    ["too long", "a".repeat(5000), /longer than expected/],
    ["non-ASCII", "clé-api-ñ", /doesn't look right/],
  ])("%s", (_, value, message) => {
    expect(() => cleanKey(value, "API key")).toThrow(KeyInputError);
    expect(() => cleanKey(value, "API key")).toThrow(message as RegExp);
  });

  it("applies a field-specific pattern (client IDs)", () => {
    expect(cleanKey("1100012345", "Client ID", { maxLength: 64, pattern: /^[A-Za-z0-9_-]+$/ })).toBe("1100012345");
    expect(() => cleanKey("1100/012345", "Client ID", { maxLength: 64, pattern: /^[A-Za-z0-9_-]+$/ })).toThrow(KeyInputError);
  });
});

import { brokerMessage } from "./adapters";

describe("brokerMessage reads each broker's error shape", () => {
  it.each([
    [{ errorCode: 401, errorMessage: { message: "Please Login and Try Again" } }, "Please Login and Try Again"], // Groww
    [{ errors: [{ message: "Invalid Auth code" }] }, "Invalid Auth code"], // Upstox
    [{ status: "error", message: "Invalid `checksum`" }, "Invalid `checksum`"], // Zerodha
    [{ stat: "Not_ok", emsg: "Invalid session" }, "Invalid session"], // Alice Blue
    [{ Error: "x" }, undefined],
  ])("%j", (body, expected) => {
    expect(brokerMessage(body as Record<string, unknown>)).toBe(expected);
  });
});
