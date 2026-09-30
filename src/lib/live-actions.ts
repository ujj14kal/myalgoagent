"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { describeFailure } from "@/lib/brokers/failures";
import { brokerById } from "@/lib/brokers/catalog";
import { cancelLiveOrder, LiveCheckError, refreshLiveOrder } from "@/lib/live/orders";
import { checkReadiness, type Readiness } from "@/lib/live/readiness";
import { confirmSignal, dismissSignal, exitNow, setDeploymentStatus, startDeployment } from "@/lib/live/deployments";
import { placeBasket, previewBasket, type BasketInput, type BasketPreview } from "@/lib/live/options-basket";

// The Live Trading page's actions. Results are returned, not thrown, so the
// reason survives production builds.

export type LiveResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function signedIn() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function explain(err: unknown, context: string, broker = "your broker"): { ok: false; error: string } {
  if (err instanceof LiveCheckError) return { ok: false, error: err.message };
  if (err instanceof BrokerError) {
    const d = describeFailure(err.failure, broker);
    return { ok: false, error: `${d.title}. ${err.failure.detail ?? d.reason}` };
  }
  logError(context, err);
  return { ok: false, error: `Something went wrong — it's been logged. Check the order in ${broker === "your broker" ? "your broker's app" : `your ${broker} app`} before retrying.` };
}

/** "Ready to go live?" — checks the whole order path without placing any order. */
export async function runReadinessCheck(broker: string): Promise<LiveResult<Readiness>> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-ready:${userId}`, 10, 5 * 60_000)) return { ok: false, error: "Checked too often — try again in a few minutes." };
  try {
    const r = await checkReadiness(userId, broker);
    revalidatePath("/app/live-trading");
    return { ok: true, data: r };
  } catch (err) {
    return explain(err, "live.readiness", brokerById(broker)?.name);
  }
}

export async function refreshMyLiveOrders(): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-refresh:${userId}`, 20, 60_000)) return { ok: false, error: "Refreshing too often — wait a moment." };
  const open = await prisma.liveOrder.findMany({ where: { userId, status: { in: ["CREATED", "OPEN", "TRIGGER_PENDING", "PARTIALLY_FILLED"] } }, select: { id: true }, take: 50 });
  let failed = 0;
  for (const o of open) {
    try {
      await refreshLiveOrder(o.id, userId);
    } catch (err) {
      failed++;
      if (!(err instanceof LiveCheckError) && !(err instanceof BrokerError)) logError("live.refresh", err, { orderId: o.id });
    }
  }
  revalidatePath("/app/live-trading");
  revalidatePath("/app/orders");
  return { ok: true, message: open.length ? `Checked ${open.length} open order${open.length === 1 ? "" : "s"}${failed ? ` (${failed} couldn't be checked)` : ""}.` : "No open orders." };
}

export async function cancelMyLiveOrder(orderId: string): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  try {
    const o = await cancelLiveOrder(orderId, userId);
    revalidatePath("/app/live-trading");
    revalidatePath("/app/orders");
    return { ok: true, message: o.status === "CANCELLED" ? "Cancelled." : `Cancel sent — Groww says ${o.brokerStatus?.toLowerCase() ?? o.status.toLowerCase()}.` };
  } catch (err) {
    return explain(err, "live.cancel");
  }
}

// ---------- options baskets (the user reviews a preview, then confirms) ----------

export async function previewOptionsBasket(input: Omit<BasketInput, "userId">): Promise<LiveResult<BasketPreview>> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-basket-preview:${userId}`, 30, 60_000)) return { ok: false, error: "Too many previews — wait a moment." };
  try {
    return { ok: true, data: await previewBasket({ ...input, userId }) };
  } catch (err) {
    return explain(err, "live.basket.preview", brokerById(input.broker)?.name);
  }
}

export async function placeOptionsBasket(input: Omit<BasketInput, "userId">): Promise<LiveResult<{ message: string; failedAt: number | null }>> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-basket:${userId}`, 5, 10 * 60_000)) return { ok: false, error: "Too many baskets sent — wait a few minutes." };
  try {
    const r = await placeBasket({ ...input, userId });
    revalidatePath("/app/live-trading");
    revalidatePath("/app/orders");
    return { ok: true, data: { message: r.message, failedAt: r.failedAt } };
  } catch (err) {
    return explain(err, "live.basket", brokerById(input.broker)?.name);
  }
}

// ---------- live deployments (strategies trading on the broker) ----------

/** Take a strategy live. Orders are always sent automatically when its rules fire — the user authored every rule. */
export async function goLive(input: { strategyId: string; broker: string; capital: number; acknowledged: boolean }): Promise<LiveResult<{ id: string }>> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (!input.acknowledged) return { ok: false, error: "Confirm you understand this places real orders on your account." };
  if (await checkRateLimit(`live-deploy:${userId}`, 10, 10 * 60_000)) return { ok: false, error: "Too many attempts — wait a few minutes." };
  try {
    const d = await startDeployment(userId, { ...input, mode: "AUTO" });
    revalidatePath("/app/live-trading");
    revalidatePath("/app/dashboard");
    return { ok: true, data: { id: d.id } };
  } catch (err) {
    return explain(err, "live.deploy", brokerById(input.broker)?.name);
  }
}

export async function setDeployment(id: string, status: "ACTIVE" | "PAUSED" | "STOPPED"): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  try {
    await setDeploymentStatus(userId, id, status);
    revalidatePath("/app/live-trading");
    revalidatePath("/app/dashboard");
    return { ok: true };
  } catch (err) {
    return explain(err, "live.deploy.status");
  }
}

export async function confirmDeploymentSignal(id: string, index: number): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-confirm:${userId}`, 20, 60_000)) return { ok: false, error: "Too fast — wait a moment." };
  try {
    const o = await confirmSignal(userId, id, index);
    revalidatePath("/app/live-trading");
    return o.status === "REJECTED" || o.status === "FAILED" ? { ok: false, error: `Not accepted: ${o.rejectReason ?? o.status}` } : { ok: true, message: "Sent to your broker." };
  } catch (err) {
    return explain(err, "live.deploy.confirm");
  }
}

export async function dismissDeploymentSignal(id: string, index: number): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  try {
    await dismissSignal(userId, id, index);
    revalidatePath("/app/live-trading");
    return { ok: true };
  } catch (err) {
    return explain(err, "live.deploy.dismiss");
  }
}

export async function exitDeploymentNow(id: string): Promise<LiveResult> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  try {
    const o = await exitNow(userId, id);
    revalidatePath("/app/live-trading");
    return o.status === "REJECTED" || o.status === "FAILED" ? { ok: false, error: `Not accepted: ${o.rejectReason ?? o.status}` } : { ok: true, message: "Exit order sent." };
  } catch (err) {
    return explain(err, "live.deploy.exit");
  }
}
