// End-to-end check of the voice pipeline without a microphone: Polly speaks a
// sentence as 16 kHz PCM, it's streamed to Transcribe exactly as the browser
// does, and the transcript is compared.
//   AWS_PROFILE=myalgoagent-admin npx tsx scripts/voice-roundtrip.ts
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { presignTranscribeUrl } from "../src/lib/ai/transcribe-presign";
import { audioEventFrame, readTranscribeFrame } from "../src/lib/ai/transcribe-stream";

const PHRASES = [
  "Create a strategy on Infosys that buys at nine fifteen and exits at nine thirty.",
  "Buy HDFC Bank when RSI crosses above thirty and MACD is positive.",
  "Backtest my Bollinger Bands strategy on Tata Motors for one year.",
];

async function roundTrip(SAY: string) {
  const pcm = await (
    await new PollyClient({ region: "ap-south-1" }).send(new SynthesizeSpeechCommand({ Text: SAY, VoiceId: "Kajal", Engine: "neural", OutputFormat: "pcm", SampleRate: "16000" }))
  ).AudioStream!.transformToByteArray();

  const ws = new WebSocket(await presignTranscribeUrl());
  ws.binaryType = "arraybuffer";
  const finals: string[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.onopen = async () => {
      // Real-time pacing: 100 ms of audio (3,200 bytes) every 100 ms.
      for (let i = 0; i < pcm.length; i += 3200) {
        ws.send(audioEventFrame(pcm.subarray(i, i + 3200)));
        await new Promise((r) => setTimeout(r, 100));
      }
      ws.send(audioEventFrame(new Uint8Array(0)));
    };
    ws.onmessage = (e) => {
      const u = readTranscribeFrame(e.data as ArrayBuffer);
      if (!u) return;
      if ("error" in u) return reject(new Error(u.error));
      if (!u.partial) finals.push(u.text);
    };
    ws.onclose = () => resolve();
    ws.onerror = () => reject(new Error("websocket error"));
  });
  console.log("said:  ", SAY);
  console.log("heard: ", finals.join(" "), "\n");
}

async function main() {
  for (const p of PHRASES) await roundTrip(p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
