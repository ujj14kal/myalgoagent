/**
 * One structured line per error/warning, written to console — the app runs
 * on Amplify/Lambda, so stdout/stderr already lands in CloudWatch Logs at
 * no extra cost. Every catch block should report through here instead of a
 * bare console.error, so failures are at least greppable/correlatable by
 * `context` even without a third-party error tracker.
 */
type LogMeta = Record<string, unknown>;

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Also keeps errors and warnings in the database for the admin portal's Logs page. Loaded lazily and only where there is a
 * database (never in tests or the browser); a failure to keep one is silent, because logging must not break the caller.
 */
function keep(level: "error" | "warn", context: string, message: string, meta?: LogMeta, stack?: string) {
  if (typeof window !== "undefined" || process.env.VITEST || process.env.NODE_ENV === "test" || !process.env.DATABASE_URL) return;
  const engine = process.env.ENGINE_VERSION !== undefined;
  void import("./site-log")
    .then(({ recordSiteEvent }) =>
      recordSiteEvent({
        kind: context === "client-error" ? "client_error" : level === "warn" ? "warning" : engine ? "engine_error" : "server_error",
        level,
        source: context === "client-error" ? "browser" : engine ? "engine" : "web",
        context,
        message,
        path: typeof meta?.url === "string" ? meta.url : typeof meta?.path === "string" ? meta.path : null,
        method: typeof meta?.method === "string" ? meta.method : null,
        userId: typeof meta?.userId === "string" ? meta.userId : null,
        userAgent: typeof meta?.userAgent === "string" ? meta.userAgent : null,
        digest: typeof meta?.digest === "string" ? meta.digest : null,
        detail: { ...(stack ? { stack: stack.slice(0, 4000) } : {}), ...(meta ?? {}) },
      }),
    )
    .catch(() => {});
}

export function logError(context: string, err: unknown, meta?: LogMeta) {
  const e = serializeError(err);
  console.error(
    JSON.stringify({
      level: "error",
      context,
      timestamp: new Date().toISOString(),
      error: e,
      ...meta,
    }),
  );
  keep("error", context, e.message, meta, "stack" in e ? e.stack : undefined);
}

export function logWarn(context: string, message: string, meta?: LogMeta) {
  keep("warn", context, message, meta);
  console.warn(
    JSON.stringify({
      level: "warn",
      context,
      timestamp: new Date().toISOString(),
      message,
      ...meta,
    }),
  );
}
