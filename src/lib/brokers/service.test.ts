import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { BrokerConnection } from "@prisma/client";
import { nextIstClock } from "./adapters";
import { callbackUrl } from "./catalog";
import { callbackProblem, LOGIN_WINDOW_MS } from "./service";

const row = (over: Partial<BrokerConnection> = {}) =>
  ({ pendingState: "abc123", pendingStartedAt: new Date(1_000_000), ...over }) as BrokerConnection;

describe("callbackProblem", () => {
  const now = 1_000_000 + 60_000;
  it("accepts the login this user just started", () => {
    expect(callbackProblem(row(), "abc123", now)).toBeNull();
    expect(callbackProblem(row(), null, now)).toBeNull(); // brokers that don't echo state (Dhan)
  });
  it("rejects a mismatched, missing or stale state", () => {
    expect(callbackProblem(row(), "zzz999", now)).toBe("state_mismatch");
    expect(callbackProblem(row(), "", now)).toBe("state_mismatch");
    expect(callbackProblem(row(), "abc123", 1_000_000 + LOGIN_WINDOW_MS + 1)).toBe("login_timeout");
    expect(callbackProblem(row({ pendingState: null }), "abc123", now)).toBe("no_login_started");
    expect(callbackProblem(null, null, now)).toBe("no_login_started");
  });
});

describe("nextIstClock", () => {
  it("returns the next 06:00 IST", () => {
    // 2026-09-28 10:00 IST = 04:30 UTC → next 06:00 IST is 2026-09-29 00:30 UTC
    expect(nextIstClock(6, 0, new Date("2026-09-28T04:30:00Z")).toISOString()).toBe("2026-09-29T00:30:00.000Z");
    // 2026-09-28 05:00 IST = 2026-09-27 23:30 UTC → same-day 06:00 IST
    expect(nextIstClock(6, 0, new Date("2026-09-27T23:30:00Z")).toISOString()).toBe("2026-09-28T00:30:00.000Z");
  });
});

it("builds the callback URL users paste into their broker app", () => {
  expect(callbackUrl("https://myalgoagent.com/", "dhan")).toBe("https://myalgoagent.com/api/brokers/dhan/callback");
});
