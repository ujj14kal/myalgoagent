import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { BillingError } from "./service";
import { RazorpayError } from "./razorpay";

/** Runs a signed-in billing action and turns every failure into a plain JSON message (never a stack trace). */
export async function billingRoute<T>(req: Request, run: (userId: string, body: Record<string, unknown>) => Promise<T>): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // no body
  }
  try {
    return NextResponse.json({ ok: true, ...(await run(userId, body)) });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    logError("api/billing", err);
    const message = err instanceof RazorpayError && err.status < 500 ? "The payment provider couldn't start this. Please try again." : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
