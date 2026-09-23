import { describe, it, expect, vi, afterEach } from "vitest";
import { logError, logWarn } from "@/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("logError writes one parseable JSON line with context, error details and meta", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("unit-test", new Error("boom"), { userId: "u1" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe("error");
    expect(line.context).toBe("unit-test");
    expect(line.error.message).toBe("boom");
    expect(line.error.stack).toContain("boom");
    expect(line.userId).toBe("u1");
    expect(typeof line.timestamp).toBe("string");
  });

  it("logError copes with a non-Error thrown value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("unit-test", "just a string");

    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.error.message).toBe("just a string");
  });

  it("logWarn writes a structured warn line", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logWarn("unit-test", "careful", { attempt: 2 });

    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "warn", context: "unit-test", message: "careful", attempt: 2 });
  });
});
