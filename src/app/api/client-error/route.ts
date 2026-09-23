import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// Client-side errors (render crashes caught by an error boundary, uncaught
// event-handler throws, unhandled promise rejections) otherwise vanish into
// the visitor's own browser console — this gives them one place to land in
// the same structured log stream as server errors. It's an unauthenticated
// endpoint by necessity (an error can happen before/without a session), so
// it's deliberately tiny: hard body-size cap, every field truncated, and
// rate-limited per client IP so it can't be used to flood the log stream.
const MAX_BODY_BYTES = 8_000;
const MAX_FIELD_CHARS = 2_000;

function clip(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_CHARS) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await enforceRateLimit(`client-error:${ip}`, 20, 60_000);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    logError("client-error", new Error(clip(body.message) ?? "Unknown client error"), {
      source: clip(body.source),
      digest: clip(body.digest),
      clientStack: clip(body.stack),
      url: clip(body.url),
      userAgent: clip(request.headers.get("user-agent")),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    logError("api/client-error", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
