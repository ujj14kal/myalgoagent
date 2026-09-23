export interface FetchRetryOptions {
  /** Per-attempt cap, covering the response body as well as the headers. */
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface FetchJsonResult<T> {
  status: number;
  ok: boolean;
  data: T | null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch + JSON parse with a hard per-attempt timeout and a bounded retry.
 *
 * Retried: network errors, timeouts, HTTP 429/5xx, and an unparseable 2xx
 * body (a truncated response is a realistic transient failure). NOT retried:
 * any other 4xx (e.g. 404 unknown symbol) — repeating it can't change the
 * answer. The timer stays armed until the body is fully read, so a server
 * that sends headers and then stalls can't hang the caller either.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit = {},
  opts: FetchRetryOptions = {},
): Promise<FetchJsonResult<T>> {
  const { timeoutMs = 10_000, maxAttempts = 2, retryDelayMs = 500 } = opts;
  let lastError: unknown = new Error("Request failed");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const retryable = res.status === 429 || res.status >= 500;

      if (retryable && attempt < maxAttempts) {
        await res.body?.cancel().catch(() => {});
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        const text = await res.text();
        let data: T | null = null;
        try {
          data = JSON.parse(text) as T;
        } catch {
          if (res.ok) throw new Error("Response body was not valid JSON");
        }
        return { status: res.status, ok: res.ok, data };
      }
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
    } finally {
      clearTimeout(timer);
    }
    await sleep(retryDelayMs * attempt);
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new Error(`Request timed out after ${timeoutMs}ms`);
  }
  throw lastError;
}
