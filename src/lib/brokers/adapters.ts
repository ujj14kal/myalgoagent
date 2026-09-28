import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import type { BrokerId } from "./catalog";
import { classifyBrokerMessage, type Failure, type FailureCode } from "./failures";

// Server-side login flows for each live broker, straight from the brokers'
// official API docs. Each user brings their own API app, so every call runs
// with that user's key/secret. Nothing here logs or returns a secret.

export type BrokerCreds = { apiKey: string; apiSecret?: string; clientId?: string };
export type BrokerSession = { accessToken: string; expiresAt: Date; accountName?: string; brokerClientId?: string };
export type BrokerProfile = { accountName?: string; brokerClientId?: string };

/** A connection failure with a known cause; the page explains it via describeFailure. */
export class BrokerError extends Error {
  readonly failure: Failure;
  constructor(code: FailureCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "BrokerError";
    this.failure = detail ? { code, detail } : { code };
  }
}

export type BrokerAdapter = {
  /** Where to send the user's browser to log in at the broker. */
  loginUrl(creds: BrokerCreds, o: { state: string; redirectUri: string }): Promise<string>;
  /** The state the broker echoed back ("" when it should have and didn't), or null for brokers that don't echo one (Dhan). */
  stateFrom(params: URLSearchParams): string | null;
  /** Turn the callback's one-time code into an access token. */
  exchange(creds: BrokerCreds, params: URLSearchParams, redirectUri: string): Promise<BrokerSession>;
  /** Cheap authenticated call proving the token works. */
  profile(creds: BrokerCreds, accessToken: string): Promise<BrokerProfile>;
};

// ---------- helpers ----------

const TIMEOUT_MS = 12_000;

async function call(url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new BrokerError("unreachable");
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON error pages (gateway errors) — fall through with an empty body.
  }
  return { status: res.status, body };
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A broker's own error text, trimmed — brokers return short, user-meaningful messages (e.g. "Invalid api_key"). */
function brokerMessage(body: Record<string, unknown>): string | undefined {
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length) return str(obj(errors[0]).message);
  return str(body.message) ?? str(body.errorMessage) ?? str(body.error_description) ?? str(body.errorMsg);
}

/**
 * Throw the most likely cause for a broker's error response. 5xx means the
 * broker itself is having trouble; otherwise its own message decides.
 */
function fail(status: number, body: Record<string, unknown>, fallback: FailureCode): never {
  if (status >= 500) throw new BrokerError("unreachable");
  const detail = brokerMessage(body)?.slice(0, 200);
  throw new BrokerError(classifyBrokerMessage(detail, fallback), detail);
}

/** The next occurrence of hh:mm India time (UTC+05:30) after `now`. */
export function nextIstClock(hour: number, minute: number, now = new Date()): Date {
  const IST_MS = 330 * 60_000;
  const ist = new Date(now.getTime() + IST_MS);
  let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, minute) - IST_MS;
  if (target <= now.getTime()) target += 86_400_000;
  return new Date(target);
}

function need(v: string | undefined, code: FailureCode = "bad_keys"): string {
  if (!v) throw new BrokerError(code);
  return v;
}

// ---------- Dhan (DhanHQ v2, individual API key flow) ----------

const dhan: BrokerAdapter = {
  async loginUrl(c) {
    const { status, body } = await call(
      `https://auth.dhan.co/app/generate-consent?client_id=${encodeURIComponent(need(c.clientId, "missing_client_id"))}`,
      { method: "POST", headers: { app_id: c.apiKey, app_secret: need(c.apiSecret) } },
    );
    const consentAppId = str(body.consentAppId);
    if (status >= 400 || !consentAppId) fail(status, body, "bad_keys");
    return `https://auth.dhan.co/login/consentApp-login?consentAppId=${encodeURIComponent(consentAppId)}`;
  },
  stateFrom: () => null,
  async exchange(c, params) {
    const tokenId = params.get("tokenId");
    if (!tokenId) throw new BrokerError("no_code");
    const { status, body } = await call(
      `https://auth.dhan.co/app/consumeApp-consent?tokenId=${encodeURIComponent(tokenId)}`,
      { method: "POST", headers: { app_id: c.apiKey, app_secret: need(c.apiSecret) } },
    );
    const accessToken = str(body.accessToken);
    if (status >= 400 || !accessToken) fail(status, body, "unknown");
    // expiryTime is an IST wall-clock time without an offset.
    const raw = str(body.expiryTime);
    const parsed = raw ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}+05:30`) : null;
    return {
      accessToken,
      expiresAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 24 * 3_600_000),
      accountName: str(body.dhanClientName),
      brokerClientId: str(body.dhanClientId) ?? c.clientId,
    };
  },
  async profile(_c, accessToken) {
    const { status, body } = await call("https://api.dhan.co/v2/profile", { headers: { "access-token": accessToken, Accept: "application/json" } });
    if (status >= 400 || !str(body.dhanClientId)) fail(status, body, "session_rejected");
    return { brokerClientId: str(body.dhanClientId) };
  },
};

// ---------- Zerodha (Kite Connect v3) ----------

const zerodha: BrokerAdapter = {
  async loginUrl(c, { state }) {
    // Kite appends redirect_params to the app's registered redirect URL.
    const redirectParams = encodeURIComponent(`state=${state}`);
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(c.apiKey)}&redirect_params=${redirectParams}`;
  },
  stateFrom: (p) => p.get("state") ?? "",
  async exchange(c, params) {
    if (params.get("status") && params.get("status") !== "success") throw new BrokerError("cancelled");
    const requestToken = params.get("request_token");
    if (!requestToken) throw new BrokerError("no_code");
    const form = new URLSearchParams({
      api_key: c.apiKey,
      request_token: requestToken,
      checksum: sha256(c.apiKey + requestToken + need(c.apiSecret)),
    });
    const { status, body } = await call(
      "https://api.kite.trade/session/token",
      { method: "POST", headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" }, body: form },
    );
    const data = obj(body.data);
    const accessToken = str(data.access_token);
    if (status >= 400 || !accessToken) fail(status, body, "unknown");
    return { accessToken, expiresAt: nextIstClock(6, 0), accountName: str(data.user_name), brokerClientId: str(data.user_id) };
  },
  async profile(c, accessToken) {
    const { status, body } = await call(
      "https://api.kite.trade/user/profile",
      { headers: { "X-Kite-Version": "3", Authorization: `token ${c.apiKey}:${accessToken}` } },
    );
    const data = obj(body.data);
    if (status >= 400 || !str(data.user_id)) fail(status, body, "session_rejected");
    return { accountName: str(data.user_name), brokerClientId: str(data.user_id) };
  },
};

// ---------- Upstox (API v2, OAuth 2.0) ----------

const upstox: BrokerAdapter = {
  async loginUrl(c, { state, redirectUri }) {
    const q = new URLSearchParams({ response_type: "code", client_id: c.apiKey, redirect_uri: redirectUri, state });
    return `https://api.upstox.com/v2/login/authorization/dialog?${q}`;
  },
  stateFrom: (p) => p.get("state") ?? "",
  async exchange(c, params, redirectUri) {
    if (params.get("error")) throw new BrokerError(params.get("error") === "access_denied" ? "cancelled" : "no_code", params.get("error_description") ?? undefined);
    const code = params.get("code");
    if (!code) throw new BrokerError("no_code");
    const form = new URLSearchParams({
      code,
      client_id: c.apiKey,
      client_secret: need(c.apiSecret),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const { status, body } = await call(
      "https://api.upstox.com/v2/login/authorization/token",
      { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form },
    );
    const accessToken = str(body.access_token);
    if (status >= 400 || !accessToken) fail(status, body, "unknown");
    return { accessToken, expiresAt: nextIstClock(3, 30), accountName: str(body.user_name), brokerClientId: str(body.user_id) };
  },
  async profile(_c, accessToken) {
    const { status, body } = await call(
      "https://api.upstox.com/v2/user/profile",
      { headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` } },
    );
    const data = obj(body.data);
    if (status >= 400 || !str(data.user_id)) fail(status, body, "session_rejected");
    return { accountName: str(data.user_name), brokerClientId: str(data.user_id) };
  },
};

// ---------- Fyers (API v3) ----------

const fyers: BrokerAdapter = {
  async loginUrl(c, { state, redirectUri }) {
    const q = new URLSearchParams({ client_id: c.apiKey, redirect_uri: redirectUri, response_type: "code", state });
    return `https://api-t1.fyers.in/api/v3/generate-authcode?${q}`;
  },
  stateFrom: (p) => p.get("state") ?? "",
  async exchange(c, params) {
    if (params.get("s") && params.get("s") !== "ok") throw new BrokerError("cancelled", params.get("message") ?? undefined);
    const authCode = params.get("auth_code");
    if (!authCode) throw new BrokerError("no_code");
    const { status, body } = await call(
      "https://api-t1.fyers.in/api/v3/validate-authcode",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", appIdHash: sha256(`${c.apiKey}:${need(c.apiSecret)}`), code: authCode }),
      },
    );
    const accessToken = str(body.access_token);
    if (status >= 400 || body.s !== "ok" || !accessToken) fail(status, body, "unknown");
    return { accessToken, expiresAt: nextIstClock(0, 0) };
  },
  async profile(c, accessToken) {
    const { status, body } = await call("https://api-t1.fyers.in/api/v3/profile", { headers: { Authorization: `${c.apiKey}:${accessToken}` } });
    const data = obj(body.data);
    if (status >= 400 || body.s !== "ok") fail(status, body, "session_rejected");
    return { accountName: str(data.name), brokerClientId: str(data.fy_id) };
  },
};

// ---------- Angel One (SmartAPI publisher login) ----------

const ANGEL_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-UserType": "USER",
  "X-SourceID": "WEB",
  // Required by SmartAPI; the real client IP routing comes with live orders.
  "X-ClientLocalIP": "127.0.0.1",
  "X-ClientPublicIP": "127.0.0.1",
  "X-MACAddress": "00:00:00:00:00:00",
};

const angelone: BrokerAdapter = {
  async loginUrl(c, { state }) {
    const q = new URLSearchParams({ api_key: c.apiKey, state });
    return `https://smartapi.angelone.in/publisher-login?${q}`;
  },
  stateFrom: (p) => p.get("state"),
  async exchange(c, params) {
    // Publisher login hands the session token straight to the redirect URL.
    const accessToken = params.get("auth_token");
    if (!accessToken) throw new BrokerError("no_code");
    const profile = await angelone.profile(c, accessToken);
    return { accessToken, expiresAt: nextIstClock(0, 0), ...profile };
  },
  async profile(c, accessToken) {
    const { status, body } = await call(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile",
      { headers: { ...ANGEL_HEADERS, "X-PrivateKey": c.apiKey, Authorization: `Bearer ${accessToken}` } },
    );
    const data = obj(body.data);
    if (status >= 400 || body.status === false || !str(data.clientcode)) fail(status, body, "session_rejected");
    return { accountName: str(data.name), brokerClientId: str(data.clientcode) };
  },
};

// ---------- Groww (Trade API, API key + secret, daily approval — no redirect) ----------

const GROWW_HEADERS = { Accept: "application/json", "X-API-VERSION": "1.0" };

const groww: BrokerAdapter = {
  // No broker page to visit: the connecting screen fetches today's token directly.
  async loginUrl() {
    return "/app/broker-connections/connecting/groww";
  },
  stateFrom: () => null,
  async exchange(c) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { status, body } = await call("https://api.groww.in/v1/token/api/access", {
      method: "POST",
      headers: { ...GROWW_HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({ key_type: "approval", checksum: sha256(need(c.apiSecret) + timestamp), timestamp }),
    });
    const payload = obj(body.payload);
    const accessToken = str(body.token) ?? str(payload.token);
    if (status >= 400 || !accessToken) fail(status, body, "approval_needed");
    const expiry = new Date(str(body.expiry) ?? str(payload.expiry) ?? "");
    return { accessToken, expiresAt: Number.isNaN(expiry.getTime()) ? nextIstClock(6, 0) : expiry };
  },
  async profile(_c, accessToken) {
    const { status, body } = await call("https://api.groww.in/v1/margins/detail/user", { headers: { ...GROWW_HEADERS, Authorization: `Bearer ${accessToken}` } });
    if (status >= 400 || body.status === "FAILURE") fail(status, body, "session_rejected");
    return {};
  },
};

// ---------- ICICI Direct (Breeze API) ----------

/** Breeze reads a JSON body on GET requests, which fetch() can't send. */
function getWithBody(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = httpsRequest(url, { method: "GET", headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: TIMEOUT_MS }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d: string) => (text += d));
      res.on("end", () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          // non-JSON error page
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve({ status: 599, body: {} }));
    req.end(body);
  });
}

const breezeError = (body: Record<string, unknown>) => ({ message: str(body.Error) });

const icicidirect: BrokerAdapter = {
  async loginUrl(c) {
    return `https://api.icicidirect.com/apiuser/login?api_key=${encodeURIComponent(c.apiKey)}`;
  },
  stateFrom: () => null,
  async exchange(c, params) {
    const apiSession = [...params.entries()].find(([k]) => k.toLowerCase() === "apisession" || k.toLowerCase() === "api_session")?.[1];
    if (!apiSession) throw new BrokerError("no_code");
    const { status, body } = await getWithBody("https://api.icicidirect.com/breezeapi/api/v1/customerdetails", JSON.stringify({ SessionToken: apiSession, AppKey: c.apiKey }), {});
    const data = obj(body.Success);
    const accessToken = str(data.session_token);
    if (status >= 400 || !accessToken) fail(status, breezeError(body), "code_expired");
    return { accessToken, expiresAt: nextIstClock(0, 0), accountName: str(data.idirect_user_name), brokerClientId: str(data.idirect_userid) };
  },
  async profile(c, accessToken) {
    const payload = "{}";
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const { status, body } = await getWithBody("https://api.icicidirect.com/breezeapi/api/v1/funds", payload, {
      "X-Checksum": `token ${sha256(timestamp + payload + need(c.apiSecret))}`,
      "X-Timestamp": timestamp,
      "X-AppKey": c.apiKey,
      "X-SessionToken": accessToken,
    });
    if (status >= 400 || (body.Status !== undefined && body.Status !== 200)) fail(status, breezeError(body), "session_rejected");
    return {};
  },
};

// ---------- 5paisa (Xstream OAuth) ----------

const FIVEPAISA = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc";

/** The 5paisa access token is a JWT whose `unique_name` is the client code the data APIs need. */
function jwtClaim(token: string, claim: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    return str(payload[claim]);
  } catch {
    return undefined;
  }
}

const fivepaisa: BrokerAdapter = {
  async loginUrl(c, { state, redirectUri }) {
    const q = new URLSearchParams({ VendorKey: c.apiKey, ResponseURL: redirectUri, State: state });
    return `https://dev-openapi.5paisa.com/WebVendorLogin/VLogin/Index?${q}`;
  },
  stateFrom: (p) => p.get("state") ?? p.get("State") ?? "",
  async exchange(c, params) {
    const requestToken = params.get("RequestToken") ?? params.get("requestToken");
    if (!requestToken) throw new BrokerError("no_code");
    const { status, body } = await call(`${FIVEPAISA}/GetAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ head: { Key: c.apiKey }, body: { RequestToken: requestToken, EncryKey: need(c.apiSecret), UserId: need(c.clientId, "missing_client_id") } }),
    });
    const b = obj(body.body);
    const accessToken = str(b.AccessToken);
    if (status >= 400 || !accessToken) fail(status, { message: str(b.Message) }, "code_expired");
    // brokerClientId stays the API User ID the login needs; the client code is shown as the account.
    return { accessToken, expiresAt: nextIstClock(23, 59), accountName: str(b.ClientName) ?? str(b.ClientCode) };
  },
  async profile(c, accessToken) {
    const clientCode = jwtClaim(accessToken, "unique_name");
    const { status, body } = await call(`${FIVEPAISA}/V4/Margin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ head: { key: c.apiKey }, body: { ClientCode: clientCode ?? "" } }),
    });
    const b = obj(body.body);
    if (status >= 400 || (b.Status !== undefined && b.Status !== 0)) fail(status, { message: str(b.Message) }, "session_rejected");
    return { accountName: clientCode };
  },
};

// ---------- Alice Blue (ANT API v2, Individual Trader) ----------

const ALICE = "https://a3.aliceblueonline.com/open-api/od/v1";

const aliceblue: BrokerAdapter = {
  async loginUrl(c) {
    return `https://ant.aliceblueonline.com/?appcode=${encodeURIComponent(c.apiKey)}`;
  },
  stateFrom: () => null,
  async exchange(c, params) {
    const authCode = params.get("authCode");
    const userId = params.get("userId");
    if (!authCode || !userId) throw new BrokerError("no_code");
    const { status, body } = await call(`${ALICE}/vendor/getUserDetails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkSum: sha256(userId + authCode + need(c.apiSecret)) }),
    });
    const accessToken = str(body.userSession);
    if (status >= 400 || body.stat !== "Ok" || !accessToken) fail(status, { message: str(body.emsg) }, "code_expired");
    return { accessToken, expiresAt: nextIstClock(6, 0), brokerClientId: str(body.clientId) ?? userId };
  },
  async profile(_c, accessToken) {
    const { status, body } = await call(`${ALICE}/profile`, { headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` } });
    if (status >= 400 || (body.status !== undefined && String(body.status).toLowerCase() !== "ok")) fail(status, body, "session_rejected");
    return { accountName: str(body.clientName), brokerClientId: str(body.clientId) };
  },
};

export const ADAPTERS: Partial<Record<BrokerId, BrokerAdapter>> = { dhan, zerodha, upstox, fyers, angelone, groww, icicidirect, "5paisa": fivepaisa, aliceblue };
