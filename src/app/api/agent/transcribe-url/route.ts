import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { AI_VOICE } from "@/lib/ai/config";
import { presignTranscribeUrl } from "@/lib/ai/transcribe-presign";

/** A pre-signed Transcribe URL for one listening session (see transcribe-presign.ts). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const userId = session.user.id;

  const limited =
    (await checkRateLimit(`agent-listen-min:${userId}`, AI_VOICE.listenPerMinute, 60_000)) ??
    (await checkRateLimit(`agent-listen-day:${userId}`, AI_VOICE.listenPerDay, 24 * 60 * 60_000));
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  try {
    const url = await presignTranscribeUrl();
    return NextResponse.json({ url, sampleRate: AI_VOICE.sampleRate, maxSeconds: AI_VOICE.maxListenSeconds });
  } catch (err) {
    logError("agent-voice:transcribe-url", err, { userId });
    return NextResponse.json({ error: "Voice input isn't available right now." }, { status: 502 });
  }
}
