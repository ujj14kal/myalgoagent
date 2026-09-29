import { describe, expect, it } from "vitest";
import { friendlyError, isStaleVersionError, STALE_MESSAGE } from "./friendly-error";

describe("friendlyError", () => {
  it("explains a page left open across an update", () => {
    const e = new Error('Server Action "4030ed86a3e22351ab93aa7ff749e86637982298be" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action');
    expect(isStaleVersionError(e)).toBe(true);
    expect(friendlyError(e)).toBe(STALE_MESSAGE);
  });
  it("hides technical messages and keeps plain ones", () => {
    expect(friendlyError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe("Something went wrong — please try again.");
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/internet connection/);
    expect(friendlyError(new Error("Pick a stock first."))).toBe("Pick a stock first.");
    expect(friendlyError(null, "Couldn't save.")).toBe("Couldn't save.");
  });
});
