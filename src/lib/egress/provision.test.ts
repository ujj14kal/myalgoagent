import { describe, expect, it } from "vitest";
import type { EgressCloud, RelayState } from "./cloud";
import { advance, onPlanChange, verifyRelay, MAX_ATTEMPTS, LAUNCH_TIMEOUT_MS, type Deps, type EgressRow } from "./provision";
import { relayUserData } from "./relay-userdata";

const T0 = new Date("2026-10-12T12:00:00Z");
const row = (o: Partial<EgressRow> = {}): EgressRow => ({
  userId: "u1", status: "PENDING", allocationId: null, publicIp: null, instanceId: null, relayHost: null, relayCertPem: null,
  tokenEnc: null, graceUntil: null, attempts: 0, lastError: null, updatedAt: T0, ...o,
});

function fake(over: Partial<EgressCloud> & { relay?: RelayState; probeOk?: boolean; now?: Date } = {}) {
  const calls: string[] = [];
  let userData = "";
  const cloud: EgressCloud = {
    allocateIp: async () => { calls.push("allocate"); return { allocationId: "eipalloc-1", publicIp: "13.0.0.1" }; },
    launchRelay: async (_u, ud) => { calls.push("launch"); userData = ud; return { instanceId: "i-1" }; },
    describeRelay: async () => over.relay ?? { state: "running", privateIp: "10.20.0.9", publicIp: null },
    associateIp: async () => { calls.push("associate"); },
    terminateRelay: async () => { calls.push("terminate"); },
    releaseIp: async () => { calls.push("release"); },
    ...over,
  };
  const deps: Deps = {
    cloud,
    probe: async () => { if (over.probeOk === false) throw new Error("refused"); return "-----BEGIN CERTIFICATE-----x"; },
    newToken: () => "t".repeat(40),
    encrypt: (t) => `enc(${t})`,
    decrypt: (e) => e.slice(4, -1),
    now: () => over.now ?? T0,
  };
  return { deps, calls, userData: () => userData };
}

describe("advance — building a relay", () => {
  it("walks PENDING → IP → relay → ACTIVE, one step per pass", async () => {
    const f = fake();
    let r = row();
    let p = await advance(r, f.deps); r = { ...r, ...p! };
    expect(p).toMatchObject({ allocationId: "eipalloc-1", publicIp: "13.0.0.1" });
    p = await advance(r, f.deps); r = { ...r, ...p! };
    expect(p).toMatchObject({ instanceId: "i-1" });
    expect(p!.tokenEnc).toBe(`enc(${"t".repeat(40)})`);
    p = await advance(r, f.deps); r = { ...r, ...p! };
    expect(p).toMatchObject({ status: "ACTIVE", relayHost: "10.20.0.9" });
    expect(f.calls).toEqual(["allocate", "launch", "associate"]);
  });

  it("puts the user's secret in the relay's launch data, never anywhere else", async () => {
    const f = fake();
    await advance(row({ allocationId: "eipalloc-1", publicIp: "13.0.0.1" }), f.deps);
    expect(f.userData()).toContain("t".repeat(40));
    expect(f.userData()).toContain("api.groww.in");
  });

  it("waits while the relay boots or the certificate isn't readable yet", async () => {
    const r = row({ allocationId: "a", publicIp: "13.0.0.1", instanceId: "i-1" });
    expect(await advance(r, fake({ relay: { state: "pending", privateIp: null, publicIp: null } }).deps)).toBeNull();
    expect(await advance(r, fake({ probeOk: false }).deps)).toBeNull();
  });

  it("starts over (same IP) when the relay died, and gives up as FAILED after repeated failures", async () => {
    const r = row({ allocationId: "a", publicIp: "13.0.0.1", instanceId: "i-1", tokenEnc: "x" });
    const p = await advance(r, fake({ relay: { state: "terminated", privateIp: null, publicIp: null } }).deps);
    expect(p).toMatchObject({ instanceId: null, tokenEnc: null, attempts: 1 });
    expect(p!.allocationId).toBeUndefined();
    const last = await advance({ ...r, attempts: MAX_ATTEMPTS - 1 }, fake({ relay: { state: "terminated", privateIp: null, publicIp: null } }).deps);
    expect(last!.status).toBe("FAILED");
  });

  it("flags a relay that never came up", async () => {
    const r = row({ allocationId: "a", publicIp: "13.0.0.1", instanceId: "i-1", updatedAt: T0 });
    const p = await advance(r, fake({ relay: { state: "pending", privateIp: null, publicIp: null }, now: new Date(T0.getTime() + LAUNCH_TIMEOUT_MS + 1) }).deps);
    expect(p).toMatchObject({ attempts: 1 });
    expect(p!.lastError).toMatch(/in time/);
  });

  it("records a cloud error and retries next pass instead of throwing", async () => {
    const f = fake({ allocateIp: async () => { throw new Error("AddressLimitExceeded"); } });
    const p = await advance(row(), f.deps);
    expect(p).toMatchObject({ attempts: 1, lastError: "AddressLimitExceeded" });
  });
});

describe("advance — releasing", () => {
  const releasing = (graceUntil: Date | null) => row({ status: "RELEASING", allocationId: "a", publicIp: "13.0.0.1", instanceId: "i-1", graceUntil });
  it("keeps the IP through the grace period", async () => {
    const f = fake();
    expect(await advance(releasing(new Date(T0.getTime() + 1000)), f.deps)).toBeNull();
    expect(f.calls).toEqual([]);
  });
  it("after the grace period removes the relay and gives the IP back", async () => {
    const f = fake();
    const p = await advance(releasing(new Date(T0.getTime() - 1000)), f.deps);
    expect(f.calls).toEqual(["terminate", "release"]);
    expect(p).toMatchObject({ status: "RELEASED", publicIp: null, tokenEnc: null });
  });
});

describe("onPlanChange", () => {
  it("a paid plan creates a relay for a user who has none (or whose last one is gone)", () => {
    expect(onPlanChange(null, true, T0)).toEqual({ create: true });
    expect(onPlanChange(row({ status: "RELEASED" }), true, T0)).toEqual({ create: true });
  });
  it("is quiet when the relay already exists", () => {
    expect(onPlanChange(row({ status: "ACTIVE" }), true, T0)).toBeNull();
    expect(onPlanChange(null, false, T0)).toBeNull();
  });
  it("a cancel starts a 30-day grace period; re-subscribing inside it keeps the same IP", () => {
    const c = onPlanChange(row({ status: "ACTIVE", instanceId: "i-1" }), false, T0)!;
    expect(c.patch!.status).toBe("RELEASING");
    expect(c.patch!.graceUntil!.getTime()).toBe(T0.getTime() + 30 * 86_400_000);
    expect(onPlanChange(row({ status: "RELEASING", instanceId: "i-1" }), true, T0)!.patch).toMatchObject({ status: "ACTIVE", graceUntil: null });
  });
});

describe("relayUserData", () => {
  it("refuses a weak token", () => expect(() => relayUserData("short")).toThrow());
  it("only opens the proxy to broker hosts", () => {
    const s = relayUserData("a".repeat(40));
    expect(s).toContain("ALLOW_HOSTS=%s");
    expect(s).toContain("api.kite.trade");
    expect(s).not.toContain("0.0.0.0");
  });
});

describe("verifyRelay", () => {
  const active = row({ status: "ACTIVE", publicIp: "13.0.0.1" });
  it("passes when brokers see the recorded address", async () => {
    expect(await verifyRelay(active, async () => "13.0.0.1\n", T0)).toEqual({ lastCheckAt: T0, lastError: null });
  });
  it("flags a different address, and a relay that does not answer", async () => {
    expect((await verifyRelay(active, async () => "65.2.155.187", T0)).lastError).toMatch(/expected 13\.0\.0\.1/);
    expect((await verifyRelay(active, async () => { throw new Error("EGRESS down"); }, T0)).lastError).toMatch(/check failed/);
  });
});

import { isExempt } from "./service";
describe("exempt accounts", () => {
  it("matches emails in the list, ignoring case and spaces", () => {
    expect(isExempt("Dinesh@Example.com", "a@b.c, dinesh@example.com")).toBe(true);
    expect(isExempt("other@example.com", "a@b.c, dinesh@example.com")).toBe(false);
    expect(isExempt("x@y.z", undefined)).toBe(false);
    expect(isExempt(null, "a@b.c")).toBe(false);
  });
});
