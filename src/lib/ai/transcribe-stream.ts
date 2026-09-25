import { EventStreamCodec } from "@smithy/eventstream-codec";
import { fromUtf8, toUtf8 } from "@smithy/util-utf8";

// Amazon Transcribe's streaming wire format (AWS event-stream frames), shared
// by the browser microphone client and the server-side test.

const codec = new EventStreamCodec(toUtf8, fromUtf8);

/** One chunk of 16-bit little-endian mono PCM as a Transcribe AudioEvent frame. An empty chunk ends the stream. */
export function audioEventFrame(pcm: Uint8Array): Uint8Array {
  return codec.encode({
    headers: {
      ":content-type": { type: "string", value: "application/octet-stream" },
      ":event-type": { type: "string", value: "AudioEvent" },
      ":message-type": { type: "string", value: "event" },
    },
    body: pcm,
  });
}

export type TranscriptUpdate = { text: string; partial: boolean } | { error: string };

/** Reads one frame from Transcribe: a transcript update, an error, or nothing useful. */
export function readTranscribeFrame(data: ArrayBuffer | Uint8Array): TranscriptUpdate | null {
  const msg = codec.decode(data instanceof Uint8Array ? data : new Uint8Array(data));
  const type = msg.headers[":message-type"]?.value;
  const body = toUtf8(msg.body);
  if (type === "exception" || type === "error") {
    let message = body;
    try {
      message = (JSON.parse(body) as { Message?: string }).Message ?? body;
    } catch {
      /* plain text */
    }
    return { error: String(msg.headers[":exception-type"]?.value ?? msg.headers[":error-code"]?.value ?? "Error") + ": " + message };
  }
  if (msg.headers[":event-type"]?.value !== "TranscriptEvent") return null;
  const parsed = JSON.parse(body) as { Transcript?: { Results?: { IsPartial?: boolean; Alternatives?: { Transcript?: string }[] }[] } };
  const result = parsed.Transcript?.Results?.[0];
  const text = result?.Alternatives?.[0]?.Transcript?.trim();
  return result && text ? { text, partial: !!result.IsPartial } : null;
}

/** Float32 samples at the device rate → 16-bit PCM at `targetRate` (simple averaging downsampler). */
export function toPcm16(input: Float32Array, inputRate: number, targetRate: number): Uint8Array {
  const ratio = inputRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const out = new DataView(new ArrayBuffer(length * 2));
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}
