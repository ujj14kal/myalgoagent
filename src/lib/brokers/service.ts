import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BrokerConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import { siteUrl } from "@/lib/site";
import { ADAPTERS, BrokerError, type BrokerCreds, type BrokerSession } from "./adapters";
import { brokerById, callbackUrl, notifierUrl, type BrokerId, type LoginMethodId } from "./catalog";
import { decryptSecret, encryptSecret } from "./crypto";
import { encodeFailure, type Failure, type FailureCode } from "./failures";

// Shared by the Server Actions (save keys, start login, test, disconnect) and
// the broker callback route. The callback is only trusted when it matches a
// login this same signed-in user started moments ago.

/** How long a started broker login stays valid for its callback. */
export const LOGIN_WINDOW_MS = 10 * 60_000;

/**
 * The origin users register in their broker apps. Always the public site
 * (brokers require an exact match), overridable for a staging host.
 */
export function callbackOrigin(): string {
  return process.env.BROKER_CALLBACK_ORIGIN || siteUrl;
}

export function redirectUriFor(broker: BrokerId): string {
  return callbackUrl(callbackOrigin(), broker);
}

export function liveAdapter(broker: string) {
  const info = brokerById(broker);
  const adapter = info?.availability === "live" ? ADAPTERS[info.id] : undefined;
  return info && adapter ? { info, adapter } : null;
}

const ctx = (row: Pick<BrokerConnection, "userId" | "broker">, field: string) => ({ userId: row.userId, broker: row.broker, field });

export function encryptFor(userId: string, broker: string, field: string, value: string): string {
  return encryptSecret(value, { userId, broker, field });
}

export function credsOf(row: BrokerConnection): BrokerCreds {
  return {
    apiKey: decryptSecret(row.apiKeyEnc, ctx(row, "apiKey")),
    apiSecret: row.apiSecretEnc ? decryptSecret(row.apiSecretEnc, ctx(row, "apiSecret")) : undefined,
    clientId: row.brokerClientId ?? undefined,
    method: (row.loginMethod as LoginMethodId | null) ?? undefined,
  };
}

/**
 * This user's private Upstox notifier path segment: stable (so it can be put
 * in their Upstox app before any keys are saved), unguessable without the
 * server key, and different for every user. Only its hash is stored.
 */
export function notifierToken(userId: string): string {
  const k = createHash("sha256").update(`upstox-notifier:${process.env.BROKER_ENCRYPTION_KEY ?? ""}`).digest();
  return createHmac("sha256", k).update(userId).digest("base64url").slice(0, 32);
}
export const notifierTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const notifierUrlFor = (userId: string) => notifierUrl(callbackOrigin(), notifierToken(userId));

/** How long an Upstox phone approval stays open (Upstox itself lapses it at 3:30 AM). */
export const PHONE_WINDOW_MS = 20 * 3_600_000;

export function accessTokenOf(row: BrokerConnection): string | null {
  return row.accessTokenEnc ? decryptSecret(row.accessTokenEnc, ctx(row, "accessToken")) : null;
}

export const newLoginState = () => randomBytes(24).toString("base64url");

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Why a callback can't be trusted, or null when it matches the pending login. */
export function callbackProblem(row: BrokerConnection | null, echoedState: string | null, now = Date.now()): FailureCode | null {
  if (!row?.pendingState || !row.pendingStartedAt) return "no_login_started";
  if (now - row.pendingStartedAt.getTime() > LOGIN_WINDOW_MS) return "login_timeout";
  if (echoedState !== null && !sameState(echoedState, row.pendingState)) return "state_mismatch";
  return null;
}

export function failureOf(err: unknown): Failure {
  return err instanceof BrokerError ? err.failure : { code: "unknown" };
}

/** Store a fresh broker session on the connection. */
export async function saveSession(row: BrokerConnection, s: BrokerSession) {
  await prisma.brokerConnection.update({
    where: { id: row.id },
    data: {
      status: "CONNECTED",
      accessTokenEnc: encryptFor(row.userId, row.broker, "accessToken", s.accessToken),
      tokenExpiresAt: s.expiresAt,
      accountName: s.accountName ?? row.accountName,
      brokerClientId: s.brokerClientId ?? row.brokerClientId,
      connectedAt: new Date(),
      lastCheckedAt: new Date(),
      lastError: null,
      pendingState: null,
      pendingStartedAt: null,
    },
  });
}

/** Record a failed attempt; a still-valid session from earlier today is kept. */
export async function saveError(rowId: string, err: unknown, opts: { keepSession?: boolean } = {}): Promise<Failure> {
  const failure = failureOf(err);
  const row = await prisma.brokerConnection.update({
    select: { broker: true },
    where: { id: rowId },
    data: {
      lastError: encodeFailure(failure),
      lastCheckedAt: new Date(),
      pendingState: null,
      pendingStartedAt: null,
      ...(opts.keepSession ? {} : { status: "ERROR" as const }),
    },
  });
  // One line per failed attempt (no keys or tokens) — the "broker logins failing" alarm counts these.
  logWarn("broker.failure", failure.code, { broker: row.broker, code: failure.code, detail: failure.detail?.slice(0, 200) });
  return failure;
}
