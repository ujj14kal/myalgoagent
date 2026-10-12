import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { decryptSecret, encryptSecret } from "@/lib/brokers/crypto";
import { randomBytes } from "node:crypto";
import { advance, onPlanChange, type Deps, type EgressRow } from "./provision";
import { awsEgressCloud, tlsCertProbe } from "./cloud-aws";

// Database side of the per-user static IP (docs/per-user-static-ip-design.md). Off unless USER_EGRESS_ENABLED=1, so the
// shared setup keeps working exactly as before until the owner switches it on.

export const userEgressEnabled = () => process.env.USER_EGRESS_ENABLED === "1";
/** Emails (comma-separated, any case) that must never be moved to their own relay, e.g. accounts already registered on the shared address. */
export function isExempt(email: string | null | undefined, list: string | undefined = process.env.USER_EGRESS_EXEMPT_EMAILS): boolean {
  if (!email || !list) return false;
  const e = email.trim().toLowerCase();
  return list.split(",").some((x) => x.trim().toLowerCase() === e);
}

const ctx = (userId: string) => ({ userId, broker: "static-ip", field: "relay-token" });

function deps(userId: string): Deps {
  return {
    cloud: awsEgressCloud(),
    probe: tlsCertProbe,
    newToken: () => randomBytes(36).toString("base64url"),
    encrypt: (t) => encryptSecret(t, ctx(userId)),
    decrypt: (e) => decryptSecret(e, ctx(userId)),
    now: () => new Date(),
  };
}

const toRow = (r: { updatedAt: Date } & Record<string, unknown>) => r as unknown as EgressRow;

/** Called whenever a user's plan changes (and by the daily check): paid creates a relay, a cancel starts the grace period. */
export async function syncEgressForPlan(userId: string, paid: boolean): Promise<void> {
  if (!userEgressEnabled()) return;
  const [row, user] = await Promise.all([prisma.userEgress.findUnique({ where: { userId } }), prisma.user.findUnique({ where: { id: userId }, select: { email: true } })]);
  if (!row && isExempt(user?.email)) return; // exempt accounts stay on the shared address whatever their plan
  const change = onPlanChange(row ? toRow(row) : null, paid, new Date());
  if (!change) return;
  if (change.create) {
    await prisma.userEgress.upsert({
      where: { userId },
      create: { userId },
      update: { status: "PENDING", attempts: 0, lastError: null, graceUntil: null, allocationId: null, publicIp: null, instanceId: null, relayHost: null, relayCertPem: null, tokenEnc: null },
    });
  } else if (change.patch) {
    await prisma.userEgress.update({ where: { userId }, data: change.patch });
  }
}

/** One scheduled pass: moves every unfinished relay one step and keeps User.liveStaticIp in step with the relay. */
export async function reconcileEgress(): Promise<{ checked: number; changed: number; failed: number }> {
  if (!userEgressEnabled()) return { checked: 0, changed: 0, failed: 0 };
  const rows = await prisma.userEgress.findMany({ where: { status: { in: ["PENDING", "RELEASING"] } }, take: 25, orderBy: { updatedAt: "asc" } });
  let changed = 0;
  let failed = 0;
  for (const r of rows) {
    const patch = await advance(toRow(r), deps(r.userId));
    if (!patch) continue;
    changed++;
    if (patch.status === "FAILED") {
      failed++;
      // Reaches the team through the existing server-error alarm.
      logError("egress.relay-failed", new Error(`static IP relay for user ${r.userId} failed: ${patch.lastError ?? "unknown"}`));
    }
    await prisma.userEgress.update({ where: { userId: r.userId }, data: patch });
    if (patch.status === "ACTIVE") {
      const ip = (await prisma.userEgress.findUnique({ where: { userId: r.userId }, select: { publicIp: true } }))?.publicIp ?? r.publicIp;
      if (ip) await prisma.user.update({ where: { id: r.userId }, data: { liveStaticIp: ip } }).catch(() => undefined);
    }
    if (patch.status === "RELEASED" && r.publicIp) await prisma.user.updateMany({ where: { id: r.userId, liveStaticIp: r.publicIp }, data: { liveStaticIp: null } });
  }
  return { checked: rows.length, changed, failed };
}

export type Relay = { host: string; certPem: string; token: string; publicIp: string | null };
export type RelayLookup = { kind: "none" } | { kind: "ready"; relay: Relay } | { kind: "not-ready"; status: string };

const cache = new Map<string, { at: number; value: RelayLookup }>();
const TTL_MS = 60_000;

/** Where a user's broker traffic should go: their relay when they have one, "none" for users on the shared address. */
export async function lookupRelay(userId: string): Promise<RelayLookup> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  // Until the table exists (or if the lookup fails) an account simply uses the shared address; an order is never blocked by this.
  const r = await prisma.userEgress.findUnique({ where: { userId } }).catch(() => null);
  let value: RelayLookup;
  if (!r || r.status === "RELEASED") value = { kind: "none" };
  else if ((r.status === "ACTIVE" || r.status === "RELEASING") && r.relayHost && r.relayCertPem && r.tokenEnc) {
    value = { kind: "ready", relay: { host: r.relayHost, certPem: r.relayCertPem, token: decryptSecret(r.tokenEnc, ctx(userId)), publicIp: r.publicIp } };
  } else value = { kind: "not-ready", status: r.status };
  cache.set(userId, { at: Date.now(), value });
  return value;
}
export const forgetRelay = (userId: string) => cache.delete(userId);
