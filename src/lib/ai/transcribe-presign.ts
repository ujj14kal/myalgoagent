import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { AI_VOICE } from "./config";
import { Sha256 } from "./mantle";

// A short-lived, pre-signed Amazon Transcribe streaming URL. The browser sends
// microphone audio straight to Transcribe in Mumbai; our server never handles
// the audio. The URL is signed for this one request (no secret key leaves the
// server) and expires in 5 minutes.

const HOST = `transcribestreaming.${AI_VOICE.transcribeRegion}.amazonaws.com`;
let signer: SignatureV4 | null = null;

export async function presignTranscribeUrl(): Promise<string> {
  signer ??= new SignatureV4({ service: "transcribe", region: AI_VOICE.transcribeRegion, sha256: Sha256, credentials: defaultProvider() });
  const path = "/stream-transcription-websocket";
  const signed = await signer.presign(
    {
      method: "GET",
      protocol: "wss:",
      hostname: HOST,
      port: 8443,
      path,
      headers: { host: `${HOST}:8443` },
      query: {
        "language-code": AI_VOICE.languageCode,
        "media-encoding": "pcm",
        "sample-rate": String(AI_VOICE.sampleRate),
        "vocabulary-name": AI_VOICE.vocabularyName,
      },
    },
    { expiresIn: 300 }
  );
  const qs = Object.entries(signed.query ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `wss://${HOST}:8443${path}?${qs}`;
}
