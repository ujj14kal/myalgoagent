import { describe, expect, it } from "vitest";
import { base32Decode, isBase32Secret, totpCode } from "./totp";

// RFC 6238 Appendix B (SHA-1): secret "12345678901234567890" in ASCII.
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totpCode", () => {
  it("matches the RFC 6238 test vectors (8 digits)", () => {
    expect(totpCode(SECRET, 59_000, 8)).toBe("94287082");
    expect(totpCode(SECRET, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpCode(SECRET, 1_111_111_111_000, 8)).toBe("14050471");
    expect(totpCode(SECRET, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totpCode(SECRET, 2_000_000_000_000, 8)).toBe("69279037");
  });
  it("gives the 6-digit code an authenticator app shows", () => {
    expect(totpCode(SECRET, 59_000)).toBe("287082");
    expect(totpCode(SECRET, 1_234_567_890_000)).toBe("005924");
  });
  it("is the same code within one 30-second step", () => {
    expect(totpCode(SECRET, 60_000)).toBe(totpCode(SECRET, 89_999));
    expect(totpCode(SECRET, 89_999)).not.toBe(totpCode(SECRET, 90_000));
  });
  it("accepts lower case, spaces and padding", () => {
    expect(totpCode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq==", 59_000)).toBe("287082");
  });
});

describe("base32 secrets", () => {
  it("decodes to the original bytes", () => {
    expect(base32Decode(SECRET).toString("ascii")).toBe("12345678901234567890");
  });
  it("rejects anything that isn't base32", () => {
    expect(() => base32Decode("eyJhbGciOi.JSUzI1NiJ9")).toThrow();
    expect(isBase32Secret("eyJraWQiOiJaTUtjVXciLCJhbGciOiJFUzI1NiJ9")).toBe(false);
    expect(isBase32Secret(SECRET)).toBe(true);
    expect(isBase32Secret("ABC")).toBe(false);
  });
});
