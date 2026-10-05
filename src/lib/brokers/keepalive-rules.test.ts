import { describe, expect, it } from "vitest";
import { canRenewUnattended, checkDue, needsMorningLogin, renewalDue } from "./keepalive-rules";

const base = { broker: "groww", loginMethod: "totp", status: "CONNECTED" as const, tokenExpiresAt: null, lastCheckedAt: null, connectedAt: null, lastError: null };
const at = (iso: string) => new Date(iso);

describe("canRenewUnattended", () => {
  it("is true only for Groww with the TOTP key", () => {
    expect(canRenewUnattended({ broker: "groww", loginMethod: "totp" })).toBe(true);
    expect(canRenewUnattended({ broker: "groww", loginMethod: null })).toBe(false);
    expect(canRenewUnattended({ broker: "zerodha", loginMethod: "totp" })).toBe(false);
    expect(canRenewUnattended({ broker: "upstox", loginMethod: "phone" })).toBe(false);
  });
});

describe("renewalDue", () => {
  const now = at("2026-10-06T00:00:00Z");
  it("renews when there is no session", () => expect(renewalDue(base, now)).toBe(true));
  it("renews when the session is about to end", () => expect(renewalDue({ ...base, tokenExpiresAt: at("2026-10-06T00:05:00Z") }, now)).toBe(true));
  it("leaves a healthy session alone", () => expect(renewalDue({ ...base, tokenExpiresAt: at("2026-10-06T06:00:00Z") }, now)).toBe(false));
  it("does not retry within the gap after a login", () => expect(renewalDue({ ...base, connectedAt: at("2026-10-05T23:58:00Z") }, now)).toBe(false));
  it("does not retry within the gap after a failure", () => expect(renewalDue({ ...base, status: "ERROR", lastError: "x", lastCheckedAt: at("2026-10-05T23:57:00Z") }, now)).toBe(false));
  it("retries after the gap", () => expect(renewalDue({ ...base, status: "ERROR", lastError: "x", lastCheckedAt: at("2026-10-05T23:50:00Z") }, now)).toBe(true));
});

describe("checkDue", () => {
  it("checks never-checked and stale sessions", () => {
    const now = at("2026-10-06T04:00:00Z");
    expect(checkDue(base, now)).toBe(true);
    expect(checkDue({ ...base, lastCheckedAt: at("2026-10-06T03:50:00Z") }, now)).toBe(false);
    expect(checkDue({ ...base, lastCheckedAt: at("2026-10-06T03:40:00Z") }, now)).toBe(true);
  });
});

describe("needsMorningLogin", () => {
  const manual = { ...base, broker: "zerodha", loginMethod: null, status: "ERROR" as const };
  it("asks on a weekday morning IST (08:45 IST = 03:15 UTC)", () => expect(needsMorningLogin(manual, at("2026-10-06T03:15:00Z"))).toBe(true));
  it("not before 08:30 IST", () => expect(needsMorningLogin(manual, at("2026-10-06T02:30:00Z"))).toBe(false));
  it("not at the weekend", () => expect(needsMorningLogin(manual, at("2026-10-04T03:15:00Z"))).toBe(false));
  it("not when already logged in", () => expect(needsMorningLogin({ ...manual, status: "CONNECTED", tokenExpiresAt: at("2026-10-06T10:00:00Z") }, at("2026-10-06T03:15:00Z"))).toBe(false));
  it("not for brokers we renew ourselves", () => expect(needsMorningLogin({ ...base, status: "ERROR" }, at("2026-10-06T03:15:00Z"))).toBe(false));
});
