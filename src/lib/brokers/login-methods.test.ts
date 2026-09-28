import { describe, expect, it } from "vitest";
import { brokerById, loginView, notifierUrl } from "./catalog";

describe("daily-login methods", () => {
  const groww = brokerById("groww")!;
  const upstox = brokerById("upstox")!;
  const zerodha = brokerById("zerodha")!;

  it("offers Groww's TOTP key and Upstox's phone approval, nothing for redirect-only brokers", () => {
    expect(groww.altLogin?.id).toBe("totp");
    expect(upstox.altLogin?.id).toBe("phone");
    expect(zerodha.altLogin).toBeUndefined();
  });

  it("asks for the TOTP token and secret only when Groww's TOTP login is chosen", () => {
    expect(loginView(groww, null).fields.map((f) => f.label)).toEqual(["API key", "API secret"]);
    expect(loginView(groww, "totp").fields.map((f) => f.label)).toEqual(["TOTP token", "TOTP secret"]);
    expect(loginView(groww, "totp").method).toBe("totp");
  });

  it("ignores a method the broker doesn't offer", () => {
    expect(loginView(zerodha, "totp").method).toBeNull();
    expect(loginView(groww, "phone").method).toBeNull();
    expect(loginView(zerodha, "totp").steps).toEqual(zerodha.steps);
  });

  it("puts the notifier URL step only in Upstox's phone method", () => {
    expect(loginView(upstox, "phone").steps).toContain("PASTE_NOTIFIER");
    expect(loginView(upstox, null).steps).not.toContain("PASTE_NOTIFIER");
    expect(notifierUrl("https://myalgoagent.com/", "abc")).toBe("https://myalgoagent.com/api/brokers/upstox/notifier/abc");
  });

  it("never asks for a password, PIN or login 2FA", () => {
    for (const info of [groww, upstox]) {
      for (const m of [null, info.altLogin!.id]) {
        for (const f of loginView(info, m).fields) expect(f.label).not.toMatch(/password|pin|mpin|otp$/i);
      }
    }
  });
});
