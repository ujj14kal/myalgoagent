export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setFetchAgentOptions } = await import("@/lib/fetch-dispatcher");

    // AWS Lambda (what Amplify's WEB_COMPUTE platform runs on under the
    // hood) freezes the execution environment between invocations. A
    // pooled keep-alive TLS socket held by undici's default dispatcher can
    // go stale — closed by the remote server or an intermediate NAT/ALB —
    // during that freeze, and the *next* request that reuses it writes
    // fresh TLS bytes onto a dead socket. Node reports that as
    // ERR_SSL_WRONG_VERSION_NUMBER ("wrong version number"), not a timeout,
    // which is exactly what's been intermittently breaking outbound calls
    // to Google's OAuth token endpoint during sign-in (users see a generic
    // server error). Shortening the keep-alive window makes undici open a
    // fresh connection far more often than Lambda's freeze cycle hits,
    // so a stale pooled socket is rarely still in the pool to reuse.
    // (setFetchAgentOptions builds the Agent from Node's own undici where
    // needed — an npm undici Agent breaks fetch() response headers on Node 26.)
    await setFetchAgentOptions({ keepAliveTimeout: 4_000, keepAliveMaxTimeout: 4_000 });
  }
}

/**
 * Every error the server hits while handling a request (a page that fails to render, a route handler or a server action
 * that throws): one structured line for CloudWatch and one row in the site log, with the page, the method and, when the
 * visitor is signed in, who it was. Never throws.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string | string[] | undefined } },
  context: { routerKind: string; routePath: string; routeType: string; renderSource?: string; revalidateReason?: string },
) {
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { logError } = await import("@/lib/logger");
    const { userFromCookieHeader } = await import("@/lib/site-log");
    const cookie = Array.isArray(request.headers.cookie) ? request.headers.cookie.join(";") : request.headers.cookie;
    const ua = Array.isArray(request.headers["user-agent"]) ? request.headers["user-agent"][0] : request.headers["user-agent"];
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
    // The path without its query string: the query can carry tokens (magic links, OAuth codes).
    const path = request.path.split("?")[0];
    logError("server.request", err, {
      path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      digest,
      userId: (await userFromCookieHeader(cookie)) ?? undefined,
      userAgent: ua,
    });
  } catch {
    /* reporting an error must never raise another */
  }
}
