import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { AI_VOICE } from "@/lib/ai/config";
import { synthesizeStream } from "@/lib/ai/speech-synth";
import { speechChunks, toSpeech } from "@/lib/ai/speech-text";
import { logError, logWarn } from "@/lib/logger";
import { alreadyPaidFor, charge, precheck } from "@/lib/credits/service";
import { ACTION_COST } from "@/lib/credits/config";

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

  // Reading a reply aloud costs 3 credits unless it is part of a spoken exchange already paid for (or was read before).
  let toCharge = false;
  if (piece === null || piece === 0) {
    if (!(await alreadyPaidFor(userId, messageId))) {
      const refused = await precheck(userId, "ai_speak", ACTION_COST.ai_speak);
      if (refused) return NextResponse.json({ error: refused.message }, { status: 402 });
      toCharge = true;
    }
  }

  const started = Date.now();
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
  } catch (err) {
    logError("agent-voice:speech-route", err, { userId, piece });
    return NextResponse.json({ error: "Voice isn't available right now." }, { status: 502 });
  }
  if (toCharge) await charge(userId, "ai_speak", ACTION_COST.ai_speak, { messageId }).catch((err) => logError("credits:charge", err, { userId, action: "ai_speak" }));
  logWarn("agent-voice:speech-served", `piece ${piece ?? "all"} ready`, { userId, piece, ms: Date.now() - started });
  // Streamed, so playback starts before the whole reply is synthesised.
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
