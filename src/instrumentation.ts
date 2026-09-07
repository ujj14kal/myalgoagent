export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setGlobalDispatcher, Agent } = await import("undici");

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
    setGlobalDispatcher(new Agent({ keepAliveTimeout: 4_000, keepAliveMaxTimeout: 4_000 }));
  }
}
