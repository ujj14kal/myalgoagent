import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { verifyWebhook } from "@/lib/billing/razorpay";
import { handleEvent, type RzpEvent } from "@/lib/billing/webhook";

// Razorpay's messages about payments and subscriptions. Believed only with a valid signature over the exact body.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const eventId = req.headers.get("x-razorpay-event-id");
  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  try {
    const result = await handleEvent(eventId, JSON.parse(raw) as RzpEvent);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    logError("api/webhooks/razorpay", err);
    return NextResponse.json({ error: "Could not process" }, { status: 500 }); // Razorpay will retry
  }
}
