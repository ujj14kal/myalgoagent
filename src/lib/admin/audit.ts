import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/request-ip";
import { logError } from "@/lib/logger";
import type { Staff } from "@/lib/admin/access";

/**
 * Record something a staff member did (or looked at) in the admin portal.
 * Never throws: a failed audit write is logged, and the action itself has
 * already been authorised.
 */
export async function audit(
  staff: Staff,
  action: string,
  target?: { type: string; id: string } | null,
  summary?: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: staff.id,
        actorEmail: staff.email,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        summary: summary?.slice(0, 500) ?? null,
        meta: meta ?? undefined,
        ip: await clientIp().catch(() => null),
      },
    });
  } catch (err) {
    logError("admin.audit", err, { action, actor: staff.id });
  }
}
