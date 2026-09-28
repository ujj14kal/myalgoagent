import { describe, expect, it } from "vitest";
import { classifyBrokerMessage, decodeFailure, describeFailure, encodeFailure, type FailureCode } from "./failures";

describe("classifyBrokerMessage", () => {
  it.each([
    ["Invalid `api_key` or `access_token`.", "bad_keys"],
    ["Invalid checksum", "bad_keys"],
    ["Invalid Credentials", "bad_keys"],
    ["invalid_client", "bad_keys"],
    ["Invalid appIdHash", "bad_keys"],
    ["Token is invalid or has expired.", "unknown"],
    ["Invalid request_token", "code_expired"],
    ["auth_code expired", "code_expired"],
    ["redirect_uri mismatch", "redirect_mismatch"],
    ["Invalid dhanClientId", "missing_client_id"],
    ["", "unknown"],
    ["API key not approved for today", "approval_needed"],
  ] as [string, FailureCode][])("%s → %s", (msg, code) => {
    expect(classifyBrokerMessage(msg, "unknown")).toBe(code);
  });
});

describe("describeFailure", () => {
  const codes: FailureCode[] = [
    "cancelled", "approval_needed", "bad_keys", "missing_client_id", "redirect_mismatch", "code_expired", "login_timeout", "state_mismatch",
    "no_login_started", "no_code", "session_rejected", "session_ended", "unreachable", "not_signed_in", "not_ready", "rate_limited", "unknown",
  ];
  it.each(codes)("%s has a title, reason and at least one fix step naming no placeholders", (code) => {
    const t = describeFailure({ code }, "Dhan");
    expect(t.title.length).toBeGreaterThan(5);
    expect(t.reason.length).toBeGreaterThan(20);
    expect(t.steps.length).toBeGreaterThan(0);
    expect(JSON.stringify(t)).not.toMatch(/undefined|\$\{/);
  });
});

it("round-trips stored failures and tolerates old plain text", () => {
  expect(decodeFailure(encodeFailure({ code: "bad_keys", detail: "Invalid api_key" }))).toEqual({ code: "bad_keys", detail: "Invalid api_key" });
  expect(decodeFailure("Something old")).toEqual({ code: "unknown", detail: "Something old" });
  expect(decodeFailure(null)).toBeNull();
});
