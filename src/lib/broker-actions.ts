"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { BrokerError, requestUpstoxApproval } from "@/lib/brokers/adapters";
import { loginView, type LoginMethodId } from "@/lib/brokers/catalog";
import { isBase32Secret } from "@/lib/brokers/totp";
import { cleanKey, KeyInputError } from "@/lib/brokers/keys";
import { brokerEncryptionReady } from "@/lib/brokers/crypto";
import { decodeFailure, type Failure } from "@/lib/brokers/failures";
import {
  accessTokenOf,
  callbackProblem,
  credsOf,
  encryptFor,
  failureOf,
  liveAdapter,
  newLoginState,
  notifierToken,
  notifierTokenHash,
  PHONE_WINDOW_MS,
  redirectUriFor,
  saveError,
  saveSession,
} from "@/lib/brokers/service";

// Broker Connections. Returned (not thrown) results: Next.js redacts thrown
// Server Action messages in production. Keys and tokens never come back to
// the browser — only a masked hint of the API key.

export type BrokerActionResult =
  | { ok: true; loginUrl?: string; message?: string }
  | { ok: false; /** A form problem to show next to the fields. */ error?: string; /** A connection failure, explained by describeFailure. */ failure?: Failure };

export type ConnectedAccount = { accountName: string | null; brokerClientId: string | null; sessionUntil: string | null };
export type CompleteLoginResult = { ok: true; account: ConnectedAccount } | { ok: false; failure: Failure };

type KeysInput = { apiKey?: string; apiSecret?: string; clientId?: string };


const istTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(d);

type Begin = { failure: Failure } | ({ userId: string } & NonNullable<ReturnType<typeof liveAdapter>>);

async function begin(brokerId: string): Promise<Begin> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { failure: { code: "not_signed_in" } };
  const limited = await checkRateLimit(`broker:${userId}`, 20, 60_000);
  if (limited) return { failure: { code: "rate_limited" } };
  const live = liveAdapter(brokerId);
  if (!live) return { failure: { code: "unknown", detail: "Connecting this broker isn't available yet." } };
  if (!brokerEncryptionReady()) return { failure: { code: "not_ready" } };
  return { userId, ...live };
}


async function loginFor(userId: string, brokerId: string) {
  const live = liveAdapter(brokerId)!;
  const row = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: brokerId } } });
  if (!row) throw new KeyInputError("Save your API keys first.");
  const state = newLoginState();
  if (row.loginMethod === "phone") {
    // Upstox texts the user an approval request; our notifier webhook finishes the login.
    try {
      await requestUpstoxApproval(credsOf(row));
      await prisma.brokerConnection.update({ where: { id: row.id }, data: { pendingState: `phone:${state}`, pendingStartedAt: new Date(), lastError: null } });
      return `/app/broker-connections/connecting/${live.info.id}?wait=phone`;
    } catch (err) {
      await saveError(row.id, err, { keepSession: row.status === "CONNECTED" });
      throw err;
    }
  }
  if (row.loginMethod === "totp") {
    // Groww allows 150 token requests a day per key; stay well inside it.
    const limited = await checkRateLimit(`broker-totp:${userId}:${brokerId}`, 40, 86_400_000);
    if (limited) throw new BrokerError("rate_limited");
  }
  try {
    const loginUrl = await live.adapter.loginUrl(credsOf(row), { state, redirectUri: redirectUriFor(live.info.id) });
    await prisma.brokerConnection.update({ where: { id: row.id }, data: { pendingState: state, pendingStartedAt: new Date(), lastError: null } });
    return loginUrl;
  } catch (err) {
    // e.g. Dhan checks the keys before its login page opens.
    await saveError(row.id, err, { keepSession: row.status === "CONNECTED" });
    throw err;
  }
}

function failed(err: unknown, context: string, meta: Record<string, unknown>): BrokerActionResult {
  if (err instanceof KeyInputError) return { ok: false, error: err.message };
  if (!(err instanceof BrokerError)) logError(context, err, meta);
  return { ok: false, failure: failureOf(err) };
}

/** Save (or replace) the user's API keys for a broker, then return the broker's login URL. */
export async function saveBrokerKeys(brokerId: string, input: KeysInput, rawMethod?: LoginMethodId | null): Promise<BrokerActionResult> {
  const b = await begin(brokerId);
  if ("failure" in b) return { ok: false, failure: b.failure };
  const { userId, info } = b;
  try {
    if (rawMethod && info.altLogin?.id !== rawMethod) throw new KeyInputError("That login method isn't available for this broker.");
    const view = loginView(info, rawMethod);
    const method = view.method;
    const wants = new Set(view.fields.map((f) => f.name));
    const label = (n: string) => view.fields.find((f) => f.name === n)?.label ?? n;
    const apiKey = cleanKey(input?.apiKey, label("apiKey"));
    // A TOTP secret is often shown in spaced groups — join it before checking.
    const rawSecret = method === "totp" && typeof input?.apiSecret === "string" ? input.apiSecret.replace(/[\s-]/g, "").toUpperCase() : input?.apiSecret;
    const apiSecret = wants.has("apiSecret") ? cleanKey(rawSecret, label("apiSecret")) : undefined;
    if (method === "totp" && apiSecret && !isBase32Secret(apiSecret)) {
      throw new KeyInputError("That TOTP secret doesn't look right — it's the shorter code under the QR (letters A–Z and digits 2–7), not the long TOTP token.");
    }
    const clientId = wants.has("clientId") ? cleanKey(input?.clientId, label("clientId"), { maxLength: 64, pattern: /^[A-Za-z0-9_-]+$/ }) : undefined;

    const data = {
      status: "KEYS_SAVED" as const,
      apiKeyEnc: encryptFor(userId, info.id, "apiKey", apiKey),
      apiSecretEnc: apiSecret ? encryptFor(userId, info.id, "apiSecret", apiSecret) : null,
      apiKeyHint: apiKey.slice(-4),
      brokerClientId: clientId ?? null,
      // New keys invalidate any session made with the old ones.
      accessTokenEnc: null,
      tokenExpiresAt: null,
      accountName: null,
      connectedAt: null,
      lastError: null,
      loginMethod: method,
      notifierTokenHash: method === "phone" ? notifierTokenHash(notifierToken(userId)) : null,
    };
    await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId, broker: info.id } },
      create: { userId, broker: info.id, ...data },
      update: data,
    });
    const loginUrl = await loginFor(userId, info.id);
    return { ok: true, loginUrl };
  } catch (err) {
    revalidatePath("/app/broker-connections");
    return failed(err, "broker.saveKeys", { userId, broker: info.id });
  }
}

/** Start the daily broker login with the keys already saved. */
export async function startBrokerLogin(brokerId: string): Promise<BrokerActionResult> {
  const b = await begin(brokerId);
  if ("failure" in b) return { ok: false, failure: b.failure };
  try {
    return { ok: true, loginUrl: await loginFor(b.userId, b.info.id) };
  } catch (err) {
    revalidatePath("/app/broker-connections");
    return failed(err, "broker.startLogin", { userId: b.userId, broker: b.info.id });
  }
}

/**
 * Finish a broker login: the broker sent the user back to our Redirect URL
 * with a one-time code (forwarded here by the callback route). Only accepted
 * for the login this user started moments ago, and only once.
 */
export async function completeBrokerLogin(brokerId: string, query: Record<string, string>): Promise<CompleteLoginResult> {
  const b = await begin(brokerId);
  if ("failure" in b) return { ok: false, failure: b.failure };
  const { userId, info, adapter } = b;
  const params = new URLSearchParams(query);
  const row = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: info.id } } });
  const keepSession = !!row && row.status === "CONNECTED" && !!row.tokenExpiresAt && row.tokenExpiresAt > new Date();

  const problem = callbackProblem(row, adapter.stateFrom(params));
  if (problem || !row) {
    if (row) await saveError(row.id, new BrokerError(problem ?? "no_login_started"), { keepSession });
    return { ok: false, failure: { code: problem ?? "no_login_started" } };
  }

  // Claim the pending login atomically so a code is never exchanged twice
  // (a refresh, a double-click, or two tabs).
  const claimed = await prisma.brokerConnection.updateMany({
    where: { id: row.id, pendingState: row.pendingState },
    data: { pendingState: null, pendingStartedAt: null },
  });
  if (claimed.count === 0) return { ok: false, failure: { code: "code_expired" } };

  try {
    const creds = credsOf(row);
    const s = await adapter.exchange(creds, params, redirectUriFor(info.id));
    let { accountName, brokerClientId } = s;
    if (!accountName) {
      try {
        const p = await adapter.profile(creds, s.accessToken);
        accountName = p.accountName;
        brokerClientId = p.brokerClientId ?? brokerClientId;
      } catch {
        // Connected already; the name is cosmetic.
      }
    }
    await saveSession(row, { ...s, accountName, brokerClientId });
    revalidatePath("/app/broker-connections");
    return {
      ok: true,
      account: {
        accountName: accountName ?? row.accountName ?? null,
        brokerClientId: brokerClientId ?? row.brokerClientId ?? null,
        sessionUntil: istTime(s.expiresAt),
      },
    };
  } catch (err) {
    if (!(err instanceof BrokerError)) logError("broker.completeLogin", err, { userId, broker: info.id });
    const failure = await saveError(row.id, err, { keepSession });
    revalidatePath("/app/broker-connections");
    return { ok: false, failure };
  }
}

export type PhoneApproval =
  | { state: "waiting"; sinceMs: number }
  | { state: "connected"; account: ConnectedAccount }
  | { state: "failed"; failure: Failure };

/** Polled by the connecting screen while the user approves on their phone. */
export async function phoneApprovalStatus(brokerId: string): Promise<PhoneApproval> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { state: "failed", failure: { code: "not_signed_in" } };
  const row = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: brokerId } } });
  if (!row) return { state: "failed", failure: { code: "no_login_started" } };
  const now = Date.now();
  if (row.pendingState?.startsWith("phone:") && row.pendingStartedAt) {
    if (now - row.pendingStartedAt.getTime() <= PHONE_WINDOW_MS) return { state: "waiting", sinceMs: now - row.pendingStartedAt.getTime() };
    return { state: "failed", failure: await saveError(row.id, new BrokerError("phone_not_approved")) };
  }
  if (row.status === "CONNECTED" && row.tokenExpiresAt && row.tokenExpiresAt.getTime() > now) {
    return { state: "connected", account: { accountName: row.accountName, brokerClientId: row.brokerClientId, sessionUntil: istTime(row.tokenExpiresAt) } };
  }
  return { state: "failed", failure: decodeFailure(row.lastError) ?? { code: "phone_not_approved" } };
}

/** Check the saved session against the broker right now. */
export async function testBrokerConnection(brokerId: string): Promise<BrokerActionResult> {
  const b = await begin(brokerId);
  if ("failure" in b) return { ok: false, failure: b.failure };
  const { userId, info, adapter } = b;
  const row = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: info.id } } });
  const token = row && accessTokenOf(row);
  if (!row || !token || (row.tokenExpiresAt && row.tokenExpiresAt <= new Date())) return { ok: false, failure: { code: "session_ended" } };
  try {
    const p = await adapter.profile(credsOf(row), token);
    await prisma.brokerConnection.update({
      where: { id: row.id },
      data: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null, accountName: p.accountName ?? row.accountName, brokerClientId: p.brokerClientId ?? row.brokerClientId },
    });
    revalidatePath("/app/broker-connections");
    return { ok: true, message: `${info.name} answered just now — your connection works.` };
  } catch (err) {
    if (!(err instanceof BrokerError)) logError("broker.test", err, { userId, broker: info.id });
    const failure = await saveError(row.id, err, { keepSession: failureOf(err).code === "unreachable" });
    revalidatePath("/app/broker-connections");
    return { ok: false, failure };
  }
}

/** Remove the saved keys and session. The user can also delete the app on the broker's side to revoke access fully. */
export async function disconnectBroker(brokerId: string): Promise<BrokerActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, failure: { code: "not_signed_in" } };
  const limited = await checkRateLimit(`broker:${userId}`, 20, 60_000);
  if (limited) return { ok: false, failure: { code: "rate_limited" } };
  await prisma.brokerConnection.deleteMany({ where: { userId, broker: brokerId } });
  revalidatePath("/app/broker-connections");
  return { ok: true };
}
