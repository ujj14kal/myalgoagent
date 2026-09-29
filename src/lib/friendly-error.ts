// Turns whatever went wrong into a sentence a user can act on. Technical
// details (codes, URLs, stack traces, framework messages) are never shown —
// they're logged separately.

export const STALE_EVENT = "maa:new-version";
export const STALE_MESSAGE = "MyAlgoAgent was just updated. Reload the page to continue — your unsaved strategy is kept.";
const OFFLINE_MESSAGE = "Couldn't reach MyAlgoAgent — check your internet connection and try again.";

/** This page was loaded before the latest update, so its server actions no longer exist. */
export function isStaleVersionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Server Action .* was not found|Failed to find Server Action|failed-to-find-server-action|ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(msg);
}

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET_DISCONNECTED/i.test(msg);
}

/** Looks like a developer-facing message rather than one written for users. */
function looksTechnical(msg: string): boolean {
  return (
    msg.length > 220 ||
    /https?:\/\/|\b[0-9a-f]{20,}\b|digest|stack|prisma|undefined|null is not|cannot read|TypeError|ReferenceError|SyntaxError|ECONN|ETIMEDOUT|status code|at \S+ \(|\bJSON\b|Unexpected token/i.test(msg)
  );
}

/**
 * A plain-English message for a caught error. A stale-page error also tells
 * the page to show its "reload" notice.
 */
export function friendlyError(err: unknown, fallback = "Something went wrong — please try again."): string {
  if (isStaleVersionError(err)) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(STALE_EVENT));
    return STALE_MESSAGE;
  }
  if (isNetworkError(err)) return OFFLINE_MESSAGE;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return msg && !looksTechnical(msg) ? msg : fallback;
}
