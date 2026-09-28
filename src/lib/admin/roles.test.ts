import { describe, expect, it } from "vitest";
import { can } from "./roles";

describe("admin roles", () => {
  it("gives nobody without a role any access", () => {
    for (const cap of ["inbox", "users.view", "users.manage", "system", "team"] as const) {
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
    }
  });
  it("lets support answer users but not act on accounts or see AWS", () => {
    expect(can("SUPPORT", "inbox")).toBe(true);
    expect(can("SUPPORT", "users.view")).toBe(true);
    expect(can("SUPPORT", "trading")).toBe(true);
    expect(can("SUPPORT", "users.manage")).toBe(false);
    expect(can("SUPPORT", "announcements")).toBe(false);
    expect(can("SUPPORT", "ai")).toBe(false);
    expect(can("SUPPORT", "system")).toBe(false);
    expect(can("SUPPORT", "audit")).toBe(false);
    expect(can("SUPPORT", "team")).toBe(false);
  });
  it("lets admins do everything except manage the team", () => {
    for (const cap of ["inbox", "users.view", "users.manage", "announcements", "trading", "ai", "system", "audit"] as const) expect(can("ADMIN", cap)).toBe(true);
    expect(can("ADMIN", "team")).toBe(false);
  });
  it("lets owners do everything", () => {
    for (const cap of ["inbox", "users.view", "users.manage", "announcements", "trading", "ai", "system", "audit", "team"] as const) expect(can("OWNER", cap)).toBe(true);
  });
});
