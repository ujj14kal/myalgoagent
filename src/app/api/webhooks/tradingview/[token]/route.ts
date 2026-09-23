import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { parseTradingViewPayload } from "@/lib/webhooks/tradingview";
import { getOrCreateActivePaperSession } from "@/lib/webhooks/session";
import { applyWebhookSignal } from "@/lib/webhooks/apply-signal";
import { logError } from "@/lib/logger";

// A TradingView alert is a one-line message or a tiny JSON object; anything
// near this size is not a real alert.
const MAX_WEBHOOK_BODY_CHARS = 20_000;

// Postgres's text columns reject a raw NUL byte outright ("invalid byte
// sequence for encoding UTF8: 0x00"). An arbitrary webhook body, or an
// upstream error message built from one (e.g. a JSON.parse SyntaxError that
// echoes a corrupted response snippet verbatim), can contain one — and this
// route's whole job is to always log what it received, even when that
// content is malformed, so every string written to WebhookAlert is
// sanitized first rather than trusted.
function sanitizeForStorage(value: string): string {
  return value.replace(/\0/g, "");
}

/**
 * Receives a TradingView alert (plain-text message or a JSON body) and
 * executes it against the target strategy's paper session. Auth is the
 * token in the URL itself, not a browser session — a webhook fires from
 * TradingView's servers, which can't hold a NextAuth session — the same
 * shape as the magic-link route (src/app/api/auth/magic-link/route.ts).
 * A wrong/unknown token returns 404 rather than 401, so a guesser can't
 * distinguish "wrong token" from "no such endpoint."
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  // Safety net: the handler below deals with every *expected* failure
  // itself, but a DB outage on the strategy lookup or alert-log write would
  // otherwise surface as a raw, unlogged 500 to TradingView.
  try {
    return await handleWebhook(request, ctx);
  } catch (err) {
    logError("api/webhooks/tradingview", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

async function handleWebhook(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Before any DB work: an unknown token costs a query on every attempt, so
  // a flood of guesses could exhaust the connection pool for everyone. The
  // per-strategy limit below only applies once a token is valid. Deliberately
  // generous (10/s) — TradingView sends every user's alerts from a small
  // shared set of IPs, so this must never throttle legitimate aggregate
  // traffic, only floods.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await enforceRateLimit(`webhook-ip:${ip}`, 600, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const strategy = await prisma.strategy.findFirst({
    // status: not DELETED — a strategy used to be gone the instant it was
    // deleted (a hard delete), so this endpoint never had to think about a
    // "deleted but still technically present" row before. Now that delete
    // is soft, a deleted strategy's webhook must stop accepting signals
    // just as completely as it used to when the row itself was removed.
    where: { webhookTokenHash: tokenHash, webhookEnabled: true, mode: "WEBHOOK", status: { not: "DELETED" } },
    include: { instrument: true },
  });
  if (!strategy) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await enforceRateLimit(`webhook:${strategy.id}`, 30, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_WEBHOOK_BODY_CHARS) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }
  const rawPayload = sanitizeForStorage(bodyText);
  const parsed = parseTradingViewPayload(rawPayload);

  // Logged even on a parse failure — a complete signal history is the whole
  // point, so "why didn't this fire" always has an answer in the UI.
  const alert = await prisma.webhookAlert.create({
    data: {
      strategyId: strategy.id,
      rawPayload,
      parsedAction: parsed.action ?? null,
      parseError: parsed.error ? sanitizeForStorage(parsed.error) : null,
    },
  });

  if (!parsed.action) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const session = await getOrCreateActivePaperSession(strategy);
    const result = await applyWebhookSignal(session, parsed.action);

    await prisma.webhookAlert.update({
      where: { id: alert.id },
      data: {
        executed: result.executed,
        paperOrderId: result.paperOrderId,
        parseError: result.error ? sanitizeForStorage(result.error) : null,
      },
    });

    return NextResponse.json({ ok: true, action: parsed.action, executed: result.executed, error: result.error });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to execute signal";
    logError("api/webhooks/tradingview:execute", err, { strategyId: strategy.id, alertId: alert.id });
    // Best-effort logging — if even a sanitized message somehow fails to
    // write, the alert row already exists from the create() above, and the
    // response below is what actually matters to the caller.
    try {
      await prisma.webhookAlert.update({ where: { id: alert.id }, data: { parseError: sanitizeForStorage(message) } });
    } catch (updateErr) {
      // Don't let a failure-to-log mask the real error response — but do
      // leave a trace that the alert row couldn't be annotated.
      logError("api/webhooks/tradingview:annotate-alert", updateErr, { alertId: alert.id });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
