import { createHmac, timingSafeEqual } from "node:crypto";

// A small Razorpay client over their REST API (no SDK to keep up to date) and the signature checks that make a payment or
// a webhook believable. Test mode and live mode are just different keys: rzp_test_… and rzp_live_….

const API = "https://api.razorpay.com/v1";

export type RazorpayKeys = { keyId: string; keySecret: string };
export function razorpayKeys(env: NodeJS.ProcessEnv = process.env): RazorpayKeys | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}
export const razorpayMode = (keyId: string): "test" | "live" => (keyId.startsWith("rzp_live_") ? "live" : "test");

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RazorpayError";
  }
}

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, keys = razorpayKeys()): Promise<T> {
  if (!keys) throw new RazorpayError("Payments aren't configured.", 503);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) throw new RazorpayError(json.error?.description ?? `Razorpay error ${res.status}`, res.status);
  return json;
}

export type RzpSubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  paid_count: number;
  notes?: Record<string, string>;
};
export type RzpOrder = { id: string; amount: number; currency: string; status: string; notes?: Record<string, string> };

export const createSubscription = (p: { planId: string; totalCount: number; notes: Record<string, string> }) =>
  call<RzpSubscription>("POST", "/subscriptions", { plan_id: p.planId, total_count: p.totalCount, quantity: 1, customer_notify: 1, notes: p.notes });
export const fetchSubscription = (id: string) => call<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
export const cancelSubscription = (id: string, atCycleEnd: boolean) => call<RzpSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
export const createOrder = (p: { amountPaise: number; receipt: string; notes: Record<string, string> }) =>
  call<RzpOrder>("POST", "/orders", { amount: p.amountPaise, currency: "INR", receipt: p.receipt.slice(0, 40), notes: p.notes });
export const fetchOrder = (id: string) => call<RzpOrder>("GET", `/orders/${encodeURIComponent(id)}`);
export type RzpPayment = { id: string; order_id?: string | null; amount: number; currency: string; status: string; method?: string; captured?: boolean };
export const fetchPayment = (id: string) => call<RzpPayment>("GET", `/payments/${encodeURIComponent(id)}`);
export const createPlan = (p: { name: string; amountPaise: number; description: string }) =>
  call<{ id: string }>("POST", "/plans", { period: "monthly", interval: 1, item: { name: p.name, amount: p.amountPaise, currency: "INR", description: p.description } });
export const listPlans = () => call<{ items: { id: string; item: { name: string; amount: number } }[] }>("GET", "/plans?count=100");

// ---------- signatures ----------

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

/** The browser hands back a signature after a subscription payment: HMAC(payment_id|subscription_id) with the key secret. */
export function verifySubscriptionPayment(p: { paymentId: string; subscriptionId: string; signature: string }, keySecret: string): boolean {
  return !!p.signature && safeEqual(hmac(keySecret, `${p.paymentId}|${p.subscriptionId}`), p.signature);
}
/** Same for a one-time order (top-up): HMAC(order_id|payment_id). */
export function verifyOrderPayment(p: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean {
  return !!p.signature && safeEqual(hmac(keySecret, `${p.orderId}|${p.paymentId}`), p.signature);
}
/** Webhooks are signed with the webhook secret over the raw request body. */
export function verifyWebhook(rawBody: string, signature: string | null, webhookSecret: string | undefined): boolean {
  return !!signature && !!webhookSecret && safeEqual(hmac(webhookSecret, rawBody), signature);
}
