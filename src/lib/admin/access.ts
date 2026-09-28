import "server-only";
import { notFound } from "next/navigation";
import type { AdminRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Who can open the admin portal, and what each role may do. The owner
// account below always has OWNER access (so the team can never lock itself
// out); everyone else is granted a role from the Team page.

export const BUILT_IN_OWNER_EMAILS = ["director@shagoonsoftech.com"];
const BUILT_IN_OWNERS = new Set(BUILT_IN_OWNER_EMAILS);

export { can, ROLE_LABEL, type Capability } from "@/lib/admin/roles";
import { can, ROLE_LABEL, type Capability } from "@/lib/admin/roles";

export type Staff = { id: string; email: string; name: string; role: AdminRole };

/** The signed-in staff member, or null for everyone else (including suspended accounts). */
export async function currentStaff(): Promise<Staff | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, username: true, adminRole: true, status: true },
  });
  if (!user || user.status === "SUSPENDED") return null;
  const role: AdminRole | null = BUILT_IN_OWNERS.has(user.email.toLowerCase()) ? "OWNER" : user.adminRole;
  if (!role) return null;
  return { id: user.id, email: user.email, name: user.name ?? user.username ?? user.email, role };
}

/**
 * For admin pages: the staff member, or a plain 404 — the portal doesn't
 * reveal that it exists to anyone without access.
 */
export async function requireStaff(cap: Capability = "inbox"): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff || !can(staff.role, cap)) notFound();
  return staff;
}

export class StaffError extends Error {}

/** For admin Server Actions: throws StaffError when not allowed (callers return it as a message). */
export async function assertStaff(cap: Capability): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) throw new StaffError("Your session has ended — sign in again.");
  if (!can(staff.role, cap)) throw new StaffError(`Your role (${ROLE_LABEL[staff.role]}) can't do this.`);
  return staff;
}

export const isBuiltInOwner = (email: string) => BUILT_IN_OWNERS.has(email.toLowerCase());
