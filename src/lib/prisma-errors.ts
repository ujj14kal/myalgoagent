/** True when `err` is a Prisma unique-constraint violation (error code
 * P2002) on the given column. Kept as a plain, non-"use server" module so
 * it stays a normal, synchronously testable function — files marked
 * "use server" (like strategy-actions.ts) may only export async server
 * actions.
 *
 * Checks three places, because Prisma's own error shape for this has not
 * been consistent: `meta.target` as an array of column names (the
 * documented shape, seen on some driver/version combinations), `meta.target`
 * as a single string, and — confirmed by reproducing this exact error
 * live against this project's actual Prisma version (7.10.0, using the new
 * driver-adapter architecture) — `meta` coming back as an empty object with
 * the constraint name only present in the human-readable `message`
 * (e.g. "Unique constraint failed on the constraint:
 * `Strategy_userId_nameNormalized_key`"). Prisma's auto-generated
 * constraint names always embed every column in the `@@unique(...)`, so
 * matching the column name as a substring of that message is reliable
 * without needing to know the exact table/constraint name. */
export function isUniqueConstraintViolation(err: unknown, column: string): boolean {
  if (typeof err !== "object" || err === null || !("code" in err) || (err as { code?: string }).code !== "P2002") {
    return false;
  }
  const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
  if (Array.isArray(target) && target.includes(column)) return true;
  if (typeof target === "string" && target.includes(column)) return true;
  const message = (err as { message?: string }).message;
  return typeof message === "string" && message.includes(column);
}
