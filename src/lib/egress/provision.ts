import { createHash } from "node:crypto";
import type { EgressCloud, CertProbe } from "./cloud";
import { relayUserData, RELAY_PORT } from "./relay-userdata";

// One step at a time, safe to repeat: every call looks at where the user's relay is and does the next thing, so a crash, a
// slow instance or an AWS hiccup is picked up by the next scheduled pass instead of leaving a half-built relay.

export type EgressRow = {
  userId: string;
  status: "PENDING" | "ACTIVE" | "RELEASING" | "RELEASED" | "FAILED";
  allocationId: string | null;
  publicIp: string | null;
  instanceId: string | null;
  relayHost: string | null;
  relayCertPem: string | null;
  tokenEnc: string | null;
  graceUntil: Date | null;
  attempts: number;
  lastError: string | null;
  lastCheckAt?: Date | null;
  updatedAt: Date;
};
export type EgressPatch = Partial<Omit<EgressRow, "userId" | "updatedAt">>;

export type Deps = {
  cloud: EgressCloud;
  probe: CertProbe;
  newToken: () => string;
  encrypt: (token: string) => string;
  decrypt: (enc: string) => string;
  now: () => Date;
};

export const MAX_ATTEMPTS = 4;
export const LAUNCH_TIMEOUT_MS = 15 * 60_000;

const fail = (row: EgressRow, why: string): EgressPatch => ({
  attempts: row.attempts + 1,
  lastError: why.slice(0, 500),
  status: row.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : row.status,
});

/** The next patch for a row (or null when there is nothing to do right now). Does at most one slow thing. */
export async function advance(row: EgressRow, d: Deps): Promise<EgressPatch | null> {
  try {
    if (row.status === "PENDING") return await advancePending(row, d);
    if (row.status === "RELEASING") return await advanceReleasing(row, d);
    return null;
  } catch (err) {
    return fail(row, err instanceof Error ? err.message : String(err));
  }
}

async function advancePending(row: EgressRow, d: Deps): Promise<EgressPatch | null> {
  if (!row.allocationId) {
    const ip = await d.cloud.allocateIp(row.userId);
    return { allocationId: ip.allocationId, publicIp: ip.publicIp, lastError: null };
  }
  if (!row.instanceId) {
    const token = d.newToken();
    const { instanceId } = await d.cloud.launchRelay(row.userId, relayUserData(token), createHash("sha256").update(token).digest("hex").slice(0, 32));
    return { instanceId, tokenEnc: d.encrypt(token), lastError: null };
  }
  const relay = await d.cloud.describeRelay(row.instanceId);
  if (relay.state === "terminated" || relay.state === "shutting-down" || relay.state === "stopping" || relay.state === "stopped") {
    // The relay died before it was ready: start over with a new one, keeping the same IP.
    return { ...fail(row, `relay ${relay.state}`), instanceId: null, tokenEnc: null };
  }
  if (relay.state !== "running" || !relay.privateIp) {
    if (d.now().getTime() - row.updatedAt.getTime() > LAUNCH_TIMEOUT_MS) return fail(row, "relay did not start in time");
    return null;
  }
  if (relay.publicIp !== row.publicIp) await d.cloud.associateIp(row.allocationId, row.instanceId);
  let cert: string;
  try {
    cert = await d.probe(relay.privateIp, RELAY_PORT);
  } catch {
    // Still booting (installing, starting the service): look again next pass, unless it has taken too long.
    if (d.now().getTime() - row.updatedAt.getTime() > LAUNCH_TIMEOUT_MS) return fail(row, "relay never answered");
    return null;
  }
  return { status: "ACTIVE", relayHost: relay.privateIp, relayCertPem: cert, attempts: 0, lastError: null };
}

async function advanceReleasing(row: EgressRow, d: Deps): Promise<EgressPatch | null> {
  if (row.graceUntil && row.graceUntil.getTime() > d.now().getTime()) return null; // still inside the grace period
  // The address can only be given back once the relay is completely gone, so: ask it to stop, come back next pass.
  if (row.instanceId) {
    const relay = await d.cloud.describeRelay(row.instanceId);
    if (relay.state !== "terminated") {
      if (relay.state !== "shutting-down") await d.cloud.terminateRelay(row.instanceId);
      return null;
    }
  }
  if (row.allocationId) await d.cloud.releaseIp(row.allocationId);
  return { status: "RELEASED", instanceId: null, allocationId: null, publicIp: null, relayHost: null, relayCertPem: null, tokenEnc: null, lastError: null };
}

/** What starting or stopping a paid plan does to the row. */
export function onPlanChange(row: EgressRow | null, paid: boolean, now: Date, graceDays = 30): { create?: true; patch?: EgressPatch } | null {
  if (paid) {
    if (!row || row.status === "RELEASED" || row.status === "FAILED") return { create: true };
    if (row.status === "RELEASING") return { patch: { status: row.instanceId ? "ACTIVE" : "PENDING", graceUntil: null } }; // re-subscribed inside the grace period: same IP
    return null;
  }
  if (row && (row.status === "ACTIVE" || row.status === "PENDING")) return { patch: { status: "RELEASING", graceUntil: new Date(now.getTime() + graceDays * 86_400_000) } };
  return null;
}

export const CHECK_EVERY_MS = 24 * 3_600_000;

/** The daily self-check: ask the relay what address brokers see and compare it with the address we recorded. */
export async function verifyRelay(row: EgressRow, seenIp: () => Promise<string>, now: Date): Promise<EgressPatch> {
  try {
    const seen = (await seenIp()).trim();
    if (seen === row.publicIp) return { lastCheckAt: now, lastError: null };
    return { lastCheckAt: now, lastError: `brokers would see ${seen}, expected ${row.publicIp}` };
  } catch (err) {
    return { lastCheckAt: now, lastError: `check failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) };
  }
}
