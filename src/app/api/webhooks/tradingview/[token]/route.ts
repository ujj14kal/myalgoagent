import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { parseTradingViewPayload } from "@/lib/webhooks/tradingview";
import { getOrCreateActivePaperSession } from "@/lib/webhooks/session";
import { applyWebhookSignal } from "@/lib/webhooks/apply-signal";

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
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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

  const rawPayload = sanitizeForStorage(await request.text());
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
    // Best-effort logging — if even a sanitized message somehow fails to
    // write, the alert row already exists from the create() above, and the
    // response below is what actually matters to the caller.
    try {
      await prisma.webhookAlert.update({ where: { id: alert.id }, data: { parseError: sanitizeForStorage(message) } });
    } catch {
      // Already logged as much as we safely can — don't let a
      // failure-to-log mask the real error response.
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
