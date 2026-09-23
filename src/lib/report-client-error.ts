/** Fire-and-forget report of a client-side error to /api/client-error.
 * Never throws — reporting a failure must not itself become a new failure. */
export function reportClientError(source: string, error: unknown, extra?: { digest?: string }) {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = JSON.stringify({
      source,
      message: err.message,
      stack: err.stack,
      digest: extra?.digest,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/client-error", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting is best-effort only.
  }
}
