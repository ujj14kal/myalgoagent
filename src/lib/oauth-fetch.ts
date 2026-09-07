/**
 * Custom fetch for Auth.js's OAuth providers (wired via the `customFetch`
 * symbol), used for their token/userinfo requests.
 *
 * CloudWatch showed these calls intermittently failing with
 * ERR_SSL_WRONG_VERSION_NUMBER — Node writing a fresh TLS handshake onto a
 * pooled keep-alive socket the remote end already closed while this AWS
 * Lambda (Amplify's WEB_COMPUTE runtime) was frozen between invocations.
 * Shortening undici's global keep-alive window (see instrumentation.ts)
 * reduces how often this happens but doesn't eliminate it — the freeze can
 * still outlast any keep-alive timeout in the worst case. This wrapper
 * makes the failure mode a non-issue instead of just rarer: on exactly this
 * class of connection-reuse error, retry once with `Connection: close`
 * (undici skips pooling on that request instead of maybe drawing a stale
 * socket again), so a real network outage still surfaces as an error but a
 * stale-socket blip does not.
 */
const RETRYABLE_CODES = new Set([
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_SOCKET",
]);

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: unknown }).cause;
  const code = (cause as { code?: string } | undefined)?.code ?? (err as { code?: string }).code;
  return typeof code === "string" && RETRYABLE_CODES.has(code);
}

export async function oauthFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  try {
    return await fetch(...args);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const [input, init] = args;
    return fetch(input, { ...init, headers: { ...init?.headers, Connection: "close" } });
  }
}
