import { describe, expect, it, vi } from "vitest";
import { deliver, googleConfigured, routesFor } from "./email";

const mail = { to: "a@b.c", subject: "s", html: "<p>x</p>", text: "x" };

describe("email routes", () => {
  it("picks the routes from the setting", () => {
    expect(routesFor(undefined, false)).toEqual(["ses"]);
    expect(routesFor(undefined, true)).toEqual(["ses", "google"]);
    expect(routesFor("google", false)).toEqual(["google"]);
    expect(routesFor("ses", true)).toEqual(["ses"]);
  });
  it("knows when Google is set up", () => {
    expect(googleConfigured({})).toBe(false);
    expect(googleConfigured({ GOOGLE_SMTP_HOST: "smtp-relay.gmail.com" })).toBe(true);
    expect(googleConfigured({ GOOGLE_SMTP_USER: "x@y.z" })).toBe(true);
  });
  it("uses the first route that works", async () => {
    const ses = vi.fn().mockResolvedValue(undefined), google = vi.fn();
    expect(await deliver(mail, ["ses", "google"], { ses, google })).toBe("ses");
    expect(google).not.toHaveBeenCalled();
  });
  it("falls back to Google when SES refuses", async () => {
    const ses = vi.fn().mockRejectedValue(new Error("Email address is not verified")), google = vi.fn().mockResolvedValue(undefined), seen = vi.fn();
    expect(await deliver(mail, ["ses", "google"], { ses, google }, seen)).toBe("google");
    expect(seen).toHaveBeenCalledOnce();
  });
  it("fails loudly when every route fails", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("down"));
    await expect(deliver(mail, ["ses", "google"], { ses: bad, google: bad })).rejects.toThrow("down");
  });
});
