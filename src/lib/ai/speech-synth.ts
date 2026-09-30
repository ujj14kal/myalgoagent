import "server-only";
import { PollyClient, SynthesizeSpeechCommand, type Engine, type LanguageCode, type VoiceId } from "@aws-sdk/client-polly";
import { logError } from "@/lib/logger";
import { AI_VOICE } from "./config";

// Text → speech with Amazon Polly: the natural voice from Singapore, Mumbai's
// neural voice as the fallback. Shared by the read-aloud route and by the agent
// reply itself (which carries its first sentence's audio, so speech can start
// without another round trip).

const clients = new Map<string, PollyClient>();
const polly = (region: string) => {
  let c = clients.get(region);
  if (!c) clients.set(region, (c = new PollyClient({ region })));
  return c;
};

async function synthesizeWith(text: string, region: string, engine: Engine) {
  const res = await polly(region).send(
    new SynthesizeSpeechCommand({ Text: text, VoiceId: AI_VOICE.voiceId as VoiceId, Engine: engine, OutputFormat: "mp3", SampleRate: "24000", LanguageCode: AI_VOICE.languageCode as LanguageCode })
  );
  if (!res.AudioStream) throw new Error("Polly returned no audio");
  return res.AudioStream.transformToWebStream();
}

/** MP3 audio of `text`. Throws if neither voice is available. */
export async function synthesizeStream(text: string, ctx: Record<string, unknown> = {}): Promise<ReadableStream> {
  try {
    return await synthesizeWith(text, AI_VOICE.primary.region, AI_VOICE.primary.engine);
  } catch (err) {
    logError("agent-voice:speak-primary", err, ctx);
    try {
      return await synthesizeWith(text, AI_VOICE.fallback.region, AI_VOICE.fallback.engine);
    } catch (err2) {
      logError("agent-voice:speak", err2, ctx);
      throw err2;
    }
  }
}

export async function synthesizeBytes(text: string, ctx: Record<string, unknown> = {}): Promise<Uint8Array> {
  return new Uint8Array(await new Response(await synthesizeStream(text, ctx)).arrayBuffer());
}
