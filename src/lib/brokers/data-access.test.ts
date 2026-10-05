import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn(), logError: vi.fn() }));
// A cache with the real semantics: a stored value is reused unless refreshed; a throwing loader stores nothing.
const { store, session, brokerCandles } = vi.hoisted(() => ({ store: new Map<string, unknown>(), session: vi.fn(), brokerCandles: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  cached: async (key: string, _ttl: number, fn: () => Promise<unknown>, opts: { refresh?: boolean } = {}) => {
    if (!opts.refresh && store.has(key)) return { value: store.get(key), at: new Date() };
    const value = await fn();
    store.set(key, value);
    return { value, at: new Date() };
  },
}));
vi.mock("@/lib/live/orders", () => ({ session }));
vi.mock("./broker-data", () => {
  class BrokerDataUnavailable extends Error {
    constructor(m: string, readonly reason: string) {
      super(m);
    }
  }
  return { BrokerDataUnavailable, brokerCandles };
});

import { dataAccess } from "./data-access";
import { BrokerDataUnavailable } from "./broker-data";

beforeEach(() => {
  store.clear();
  session.mockReset().mockResolvedValue({ creds: {}, token: "t" });
  brokerCandles.mockReset();
});

describe("dataAccess — checked through the user's own connection", () => {
  it("is available when the broker returns candles", async () => {
    brokerCandles.mockResolvedValue([{ time: 1 }, { time: 2 }]);
    const a = await dataAccess("u", "upstox");
    expect(a.status).toBe("available");
    expect(brokerCandles.mock.calls[0][2]).toBe("RELIANCE.NS");
  });
  it("tells a Groww free-plan user exactly what to activate", async () => {
    brokerCandles.mockRejectedValue(new BrokerDataUnavailable("refused", "no_access"));
    const a = await dataAccess("u", "groww");
    expect(a.status).toBe("no_plan");
    expect(a.detail).toContain("₹499/month");
  });
  it("picks up a newly bought data plan on 'Check again'", async () => {
    brokerCandles.mockRejectedValueOnce(new BrokerDataUnavailable("refused", "no_access"));
    expect((await dataAccess("u", "groww")).status).toBe("no_plan");
    brokerCandles.mockResolvedValue([{ time: 1 }]);
    expect((await dataAccess("u", "groww")).status).toBe("no_plan"); // cached
    expect((await dataAccess("u", "groww", { refresh: true })).status).toBe("available");
    expect((await dataAccess("u", "groww")).status).toBe("available"); // and remembered
  });
  it("never remembers a logged-out or failed check", async () => {
    session.mockRejectedValueOnce(new Error("Connect Groww for today first"));
    expect((await dataAccess("u", "groww")).status).toBe("logged_out");
    brokerCandles.mockRejectedValueOnce(new Error("timeout"));
    expect((await dataAccess("u", "groww")).status).toBe("error");
    brokerCandles.mockResolvedValue([{ time: 1 }]);
    expect((await dataAccess("u", "groww")).status).toBe("available");
  });
  it("says plainly when a broker doesn't supply data here, without calling it", async () => {
    const a = await dataAccess("u", "aliceblue");
    expect(a.status).toBe("not_supported");
    expect(session).not.toHaveBeenCalled();
  });
});
