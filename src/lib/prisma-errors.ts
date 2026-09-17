/** True when `err` is a Prisma unique-constraint violation (error code
 * P2002) on the given column. Kept as a plain, non-"use server" module so
 * it stays a normal, synchronously testable function — files marked
 * "use server" (like strategy-actions.ts) may only export async server
 * actions. */
export function isUniqueConstraintViolation(err: unknown, column: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002" &&
    "meta" in err &&
    !!(err as { meta?: { target?: string[] } }).meta?.target?.includes(column)
  );
}
