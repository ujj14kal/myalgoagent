import type { AdminRole } from "@prisma/client";

// What each admin role may do — pure, so it's unit-tested (access.ts applies it).

const RANK: Record<AdminRole, number> = { SUPPORT: 1, ADMIN: 2, OWNER: 3 };

export type Capability =
  | "inbox" // read and reply to support cases and feedback
  | "users.view"
  | "users.manage" // suspend, sign out, deletion, broker disconnect, data export
  | "announcements"
  | "trading"
  | "ai"
  | "system" // AWS health, cost, logs, schedules
  | "audit"
  | "team";

const NEEDS: Record<Capability, AdminRole> = {
  inbox: "SUPPORT",
  "users.view": "SUPPORT",
  "users.manage": "ADMIN",
  announcements: "ADMIN",
  trading: "SUPPORT",
  ai: "ADMIN",
  system: "ADMIN",
  audit: "ADMIN",
  team: "OWNER",
};

export const ROLE_LABEL: Record<AdminRole, string> = { OWNER: "Owner", ADMIN: "Admin", SUPPORT: "Support" };

export function can(role: AdminRole | null | undefined, cap: Capability): boolean {
  return !!role && RANK[role] >= RANK[NEEDS[cap]];
}
