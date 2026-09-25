import { NextRequest, NextResponse } from "next/server";
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { AI_VOICE } from "@/lib/ai/config";
import { toSpeech } from "@/lib/ai/speech-text";

// Reads one of the agent's replies aloud. Takes a message id, not free text, so
// it can only ever voice the user's own agent replies.

const clients = new Map<string, PollyClient>();
const polly = (region: string) => {
  let c = clients.get(region);
  if (!c) clients.set(region, (c = new PollyClient({ region })));
  return c;
};

async function synthesize(text: string, region: string, engine: Engine) {
  const res = await polly(region).send(
    new SynthesizeSpeechCommand({ Text: text, VoiceId: AI_VOICE.voiceId as VoiceId, Engine: engine, OutputFormat: "mp3", SampleRate: "24000", LanguageCode: AI_VOICE.languageCode as LanguageCode })
  );
  if (!res.AudioStream) throw new Error("Polly returned no audio");
  return res.AudioStream.transformToWebStream();
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const userId = session.user.id;

  const messageId = request.nextUrl.searchParams.get("m") ?? "";
  if (!messageId) return NextResponse.json({ error: "Missing message." }, { status: 400 });

  const limited = await checkRateLimit(`agent-speak:${userId}`, AI_VOICE.speakPerDay, 24 * 60 * 60_000);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const message = await prisma.agentMessage.findFirst({
    where: { id: messageId, role: "ASSISTANT", conversation: { userId } },
    select: { content: true },
  });
  if (!message) return NextResponse.json({ error: "We couldn't find that reply." }, { status: 404 });

  const text = toSpeech(message.content);
  if (!text) return NextResponse.json({ error: "Nothing to read aloud." }, { status: 422 });

  let audio: ReadableStream;
  try {
    audio = await synthesize(text, AI_VOICE.primary.region, AI_VOICE.primary.engine);
  } catch (err) {
    logError("agent-voice:speak-primary", err, { userId });
    try {
      audio = await synthesize(text, AI_VOICE.fallback.region, AI_VOICE.fallback.engine);
    } catch (err2) {
      logError("agent-voice:speak", err2, { userId });
      return NextResponse.json({ error: "Voice isn't available right now." }, { status: 502 });
    }
  }
  // Streamed, so playback starts before the whole reply is synthesised.
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
