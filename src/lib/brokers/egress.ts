import "@/lib/fetch-dispatcher"; // must load before npm undici — see that file
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { currentEgressContext, EgressUnavailableError } from "@/lib/egress/context";
import { RELAY_NAME as USER_RELAY_NAME, RELAY_PORT } from "@/lib/egress/relay-userdata";

// Server-side only. Broker API calls leave through our egress relay (infra/egress-proxy) when it
// is configured, so brokers always see the one static IP registered on the
// client's account. Unset BROKER_EGRESS_URL to fall back to calling brokers
// directly from wherever the app runs (Amplify) — nothing else changes.

const RELAY_NAME = "egress.myalgoagent.internal"; // the name on the relay's certificate

let agent: ProxyAgent | null | undefined;

export function egressAgent(): ProxyAgent | null {
  if (agent !== undefined) return agent;
  const uri = process.env.BROKER_EGRESS_URL;
  const secret = process.env.BROKER_EGRESS_SECRET;
  const ca = process.env.BROKER_EGRESS_CA;
  if (!uri || !secret || !ca) return (agent = null);
  agent = new ProxyAgent({
    uri,
    token: `Bearer ${secret}`,
    // Our own CA, pinned: the relay is trusted only if its certificate was issued by it.
    proxyTls: { ca: Buffer.from(ca, "base64").toString("utf8"), servername: RELAY_NAME },
  });
  return agent;
}

export const egressEnabled = () => egressAgent() !== null;

// A paid user's own relay (their own static IP). Chosen from the user the surrounding code declared with withUserEgress().
const userAgents = new Map<string, { at: number; agent: ProxyAgent }>();
const AGENT_TTL_MS = 5 * 60_000;

/**
 * The agent for the current user's calls: their own relay when they have one; null when they are on the shared address
 * (or there is no user context). Throws EgressUnavailableError when an order-grade call is made for a user whose relay isn't ready.
 */
async function agentForContext(): Promise<ProxyAgent | null> {
  const c = currentEgressContext();
  if (!c) return null;
  const { lookupRelay } = await import("@/lib/egress/service");
  const found = await lookupRelay(c.userId);
  if (found.kind === "none") return null;
  if (found.kind === "not-ready") {
    if (c.strict) throw new EgressUnavailableError();
    return null;
  }
  const key = `${c.userId}|${found.relay.host}|${found.relay.certPem.length}`;
  const hit = userAgents.get(key);
  if (hit && Date.now() - hit.at < AGENT_TTL_MS) return hit.agent;
  const agent = new ProxyAgent({
    uri: `https://${found.relay.host}:${RELAY_PORT}`,
    token: `Bearer ${found.relay.token}`,
    // This user's relay certificate, pinned when it was created.
    proxyTls: { ca: found.relay.certPem, servername: USER_RELAY_NAME },
  });
  userAgents.set(key, { at: Date.now(), agent });
  return agent;
}

/** fetch() for broker APIs — through the static-IP relay when configured, direct otherwise. */
export async function brokerFetch(url: string, init: RequestInit): Promise<{ status: number; text(): Promise<string> }> {
  const a = (await agentForContext()) ?? egressAgent();
  if (!a) return fetch(url, init);
  return undiciFetch(url, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: a });
}

/** A GET that carries a JSON body (ICICI Breeze), through the relay when configured. */
export async function brokerGetWithBody(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; text: string } | null> {
  const a = (await agentForContext()) ?? egressAgent();
  if (!a) return null; // caller uses its direct path
  const u = new URL(url);
  const res = await a.request({
    origin: u.origin,
    path: `${u.pathname}${u.search}`,
    method: "GET",
    headers: { ...headers, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    body,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  return { status: res.statusCode, text: await res.body.text() };
}

/** The IP brokers see right now (through the relay, or this server's own when direct). */
export async function currentEgressIp(): Promise<{ ip: string; viaRelay: boolean }> {
  const res = await brokerFetch("https://checkip.amazonaws.com", { signal: AbortSignal.timeout(8000), cache: "no-store" });
  return { ip: (await res.text()).trim(), viaRelay: egressEnabled() };
}

/**
 * The static IP assigned to this user (set per account in the admin portal).
 * Brokers tie a static IP to one client, so there's deliberately no shared
 * fallback: an account without its own IP has none to register.
 */
export function registeredStaticIp(userIp?: string | null): string | null {
  return userIp || null;
}
