import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJsonWithRetry } from "@/lib/fetch-json-with-retry";

const FAST = { timeoutMs: 50, maxAttempts: 2, retryDelayMs: 1 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJsonWithRetry", () => {
  it("returns parsed JSON on a normal success without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ a: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchJsonWithRetry<{ a: number }>("https://x.test", {}, FAST);

    expect(res).toEqual({ status: 200, ok: true, data: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 503 and returns the successful second response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchJsonWithRetry("https://x.test", {}, FAST);

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 404 — repeating it can't change the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchJsonWithRetry("https://x.test", {}, FAST);

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a network error and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ recovered: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchJsonWithRetry<{ recovered: boolean }>("https://x.test", {}, FAST);

    expect(res.data).toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung request at the timeout, retries, then throws a clear timeout error", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJsonWithRetry("https://x.test", {}, FAST)).rejects.toThrow(/timed out after 50ms/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives back the final 5xx status (not a throw) once retries are exhausted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchJsonWithRetry("https://x.test", {}, FAST);

    expect(res.status).toBe(500);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an unparseable 2xx body as a failure worth retrying, then throws", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("<html>not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJsonWithRetry("https://x.test", {}, FAST)).rejects.toThrow(/not valid JSON/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
