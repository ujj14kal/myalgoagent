"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { describeFailure } from "@/lib/brokers/failures";
import { brokerById } from "@/lib/brokers/catalog";
import { cancelLiveOrder, connectivityTest, LiveCheckError, refreshLiveOrder } from "@/lib/live/orders";

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

export type TestStep = { step: string; ok: boolean; detail?: string };

export async function runConnectivityTest(broker: string, instrumentSymbol: string): Promise<LiveResult<TestStep[]>> {
  const userId = await signedIn();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await checkRateLimit(`live-test:${userId}`, 5, 10 * 60_000)) return { ok: false, error: "Too many test orders — try again in a few minutes." };
  try {
    const { steps } = await connectivityTest(userId, broker, instrumentSymbol);
    revalidatePath("/app/live-trading");
    revalidatePath("/app/orders");
    return { ok: true, data: steps };
  } catch (err) {
    return explain(err, "live.test", brokerById(broker)?.name);
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
