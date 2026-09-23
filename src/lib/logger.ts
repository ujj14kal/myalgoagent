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

export function logError(context: string, err: unknown, meta?: LogMeta) {
  console.error(
    JSON.stringify({
      level: "error",
      context,
      timestamp: new Date().toISOString(),
      error: serializeError(err),
      ...meta,
    }),
  );
}

export function logWarn(context: string, message: string, meta?: LogMeta) {
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
