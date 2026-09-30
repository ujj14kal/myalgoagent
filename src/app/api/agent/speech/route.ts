import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { AI_VOICE } from "@/lib/ai/config";
import { synthesizeStream } from "@/lib/ai/speech-synth";
import { speechChunks, toSpeech } from "@/lib/ai/speech-text";

// Reads one of the agent's replies aloud. Takes a message id, not free text, so
// it can only ever voice the user's own agent replies. With `c` it returns just
// piece number c of the reply (see speechChunks), so the browser can start on the
// first sentence while the rest is still being made.

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const userId = session.user.id;

  const messageId = request.nextUrl.searchParams.get("m") ?? "";
  if (!messageId) return NextResponse.json({ error: "Missing message." }, { status: 400 });

  const cParam = request.nextUrl.searchParams.get("c");
  const piece = cParam === null ? null : Number(cParam);
  if (piece !== null && (!Number.isInteger(piece) || piece < 0)) return NextResponse.json({ error: "Invalid piece." }, { status: 400 });

  // A reply counts once, however many pieces it is voiced in.
  if (piece === null || piece === 0) {
    const limited = await checkRateLimit(`agent-speak:${userId}`, AI_VOICE.speakPerDay, 24 * 60 * 60_000);
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  }

  const message = await prisma.agentMessage.findFirst({
    where: { id: messageId, role: "ASSISTANT", conversation: { userId } },
    select: { content: true },
  });
  if (!message) return NextResponse.json({ error: "We couldn't find that reply." }, { status: 404 });

  let text = toSpeech(message.content);
  if (piece !== null) {
    const pieces = speechChunks(text);
    if (piece >= Math.max(pieces.length, 1)) return NextResponse.json({ error: "No such piece." }, { status: 404 });
    text = pieces[piece] ?? text;
  }
  if (!text) return NextResponse.json({ error: "Nothing to read aloud." }, { status: 422 });

  let audio: ReadableStream;
  try {
    audio = await synthesizeStream(text, { userId });
  } catch {
    return NextResponse.json({ error: "Voice isn't available right now." }, { status: 502 });
  }
  // Streamed, so playback starts before the whole reply is synthesised.
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
