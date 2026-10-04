import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { liveOrderEvent: { create: vi.fn().mockResolvedValue({}) } } }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

import { BrokerError } from "@/lib/brokers/adapters";
import { placeWithRetry } from "./orders";

describe("placeWithRetry", () => {
  it("sends the order again after a rate-limit answer, then succeeds", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new BrokerError("rate_limited")).mockRejectedValueOnce(new BrokerError("rate_limited")).mockResolvedValue("ok");
    await expect(placeWithRetry(attempt, "o1", [1, 1, 1])).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
  });
  it("gives up after the last wait and surfaces the rate limit", async () => {
    const attempt = vi.fn().mockRejectedValue(new BrokerError("rate_limited"));
    await expect(placeWithRetry(attempt, "o1", [1, 1])).rejects.toMatchObject({ failure: { code: "rate_limited" } });
    expect(attempt).toHaveBeenCalledTimes(3);
  });
  it("never resends after an unanswered request (the order may exist) or any other failure", async () => {
    for (const code of ["unreachable", "session_rejected", "unknown"] as const) {
      const attempt = vi.fn().mockRejectedValue(new BrokerError(code));
      await expect(placeWithRetry(attempt, "o1", [1, 1])).rejects.toBeInstanceOf(BrokerError);
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });
});
