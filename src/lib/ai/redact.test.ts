import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it.each([
    ["Here is my Upstox API secret: q7Rk29xLm4Pz81Vt, please connect it", "q7Rk29xLm4Pz81Vt"],
    ["api key = 3f9a8b7c6d5e", "3f9a8b7c6d5e"],
    ["my password is Trade@2024", "Trade"],
    ["access token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdEFGHijklMNOP", "eyJhbGciOiJIUzI1NiJ9"],
    ["OTP 482913", "482913"],
    ["the Secret ID is AB12CD34EF", "AB12CD34EF"],
  ])("hides the value in %s", (input, secret) => {
    const r = redactSecrets(input);
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain(secret);
    expect(r.text).toContain("[hidden secret]");
  });

  it.each([
    "Buy INFY when RSI(14) crosses above 30",
    "How do I get an API key for Dhan?",
    "Where do I paste the secret?",
    "Trade a pin bar at support",
    "My token expired, what now?",
  ])("leaves ordinary messages alone: %s", (input) => {
    expect(redactSecrets(input)).toEqual({ text: input, redacted: false });
  });
});
