import { describe, expect, it } from "vitest";
import { chainForAgent } from "./chain-agent";
import { enrichChain, type RawSide } from "./chain";

const NOW = Date.parse("2026-10-06T11:00:00+05:30");
const blank: RawSide = { ltp: null, bid: null, ask: null, prevClose: null, volume: null, oi: null, prevOi: null, iv: null, delta: null, gamma: null, theta: null, vega: null, rho: null };
const rows = [24900, 25000, 25100].map((k) => ({ strike: k, call: { ...blank, ltp: 120, bid: 119, ask: 121, volume: 10, oi: 100, iv: 0.13, delta: 0.5 }, put: { ...blank, ltp: 110, volume: 0, oi: 50 } }));
const chain = enrichChain({ underlying: "NIFTY", expiry: "2026-10-13", spot: 25000, lotSize: 65, source: { kind: "broker", broker: "groww", name: "Groww" }, hasDepth: true, rows }, { nowMs: NOW });

describe("the agent's option chain", () => {
  it("names the source and summarises strikes around the money", () => {
    const a = chainForAgent(chain, ["2026-10-13", "2026-10-20"], []);
    expect(a.source).toBe("the user's own Groww account");
    expect(a.other_expiries).toEqual(["2026-10-20"]);
    expect((a as { strikes: unknown[] }).strikes).toHaveLength(3);
  });
  it("gives one contract in full with each Greek's origin and warnings", () => {
    const a = chainForAgent(chain, ["2026-10-13"], [], { strike: 25000, type: "PE" }) as Record<string, unknown> & { put: { greeks: Record<string, { origin: string }>; warnings: string[] } };
    expect(a.call).toBeUndefined();
    expect(a.put.greeks.iv_pct.origin).toBe("calculated");
    expect(a.put.greeks.rho.origin).toBe("calculated");
    expect(a.put.warnings[0]).toMatch(/No trades today/);
    const c = chainForAgent(chain, ["2026-10-13"], [], { strike: 25000, type: "CE" }) as unknown as { call: { greeks: Record<string, { origin: string; value: number }> } };
    expect(c.call.greeks.delta).toEqual({ value: 0.5, origin: "provided" });
    expect(c.call.greeks.iv_pct.value).toBe(13);
  });
  it("says which strikes exist when the asked one doesn't", () => {
    expect(chainForAgent(chain, [], [], { strike: 25020 })).toMatchObject({ error: expect.stringMatching(/Nearest listed: 25000/) });
  });
});
