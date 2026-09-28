// Small, shared guards for user-supplied text.

/** Escapes text for safe interpolation into HTML (emails, never raw into pages). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A single line (email subjects, names): no line breaks, trimmed, capped. */
export function oneLine(value: unknown, max: number): string {
  return (typeof value === "string" ? value : "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

/**
 * Trimmed text from a Server Action argument. Actions can be called directly
 * with any JSON, so a non-string becomes "" (and fails the caller's "required"
 * check) instead of crashing on `.trim()`; anything longer than `max` is
 * rejected by the caller via `tooLong`.
 */
export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const tooLong = (value: string, max: number) => value.length > max;

/** Server-side limits for free-text fields. */
export const LIMITS = {
  feedback: 5_000,
  page: 300,
  supportSubject: 200,
  supportMessage: 5_000,
  fullName: 100,
  phone: 20,
  email: 254,
  strategyName: 120,
} as const;
