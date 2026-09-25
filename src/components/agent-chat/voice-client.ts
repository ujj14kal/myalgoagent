"use client";

import { audioEventFrame, readTranscribeFrame, toPcm16 } from "@/lib/ai/transcribe-stream";

// Browser side of voice: microphone → Amazon Transcribe (streamed over a
// pre-signed WebSocket, the audio never touches our server) and agent replies
// → Amazon Polly (streamed MP3 from /api/agent/speech).

export type ListenHandlers = {
  /** Everything heard so far in this session (final words plus the current guess). */
  onTranscript: (text: string, final: boolean) => void;
  /** Microphone loudness 0–1, for the listening animation. */
  onLevel?: (level: number) => void;
  onError: (message: string) => void;
  /** The session ended (stopped, timed out or the connection closed). */
  onEnd?: () => void;
};

export type Listener = { stop: () => void };

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== "undefined" && typeof AudioContext !== "undefined";
}

function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow it for this site in your browser's settings, then try again.";
  if (name === "NotFoundError") return "No microphone was found on this device.";
  return "We couldn't start the microphone. Please try again.";
}

/** Starts listening. Resolves once the microphone and connection are live. */
export async function startListening(h: ListenHandlers): Promise<Listener> {
  const res = await fetch("/api/agent/transcribe-url", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { url?: string; sampleRate?: number; maxSeconds?: number; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Voice input isn't available right now.");
  const targetRate = data.sampleRate ?? 16000;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (err) {
    throw new Error(micError(err));
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally supported and needs no worker file (CSP-friendly).
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const ws = new WebSocket(data.url);
  ws.binaryType = "arraybuffer";

  const finals: string[] = [];
  let stopped = false;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    h.onEnd?.();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    // An empty audio event tells Transcribe we're done; it sends the last words, then closes.
    if (ws.readyState === WebSocket.OPEN) ws.send(audioEventFrame(new Uint8Array(0)));
    setTimeout(() => ws.readyState <= WebSocket.OPEN && ws.close(), 1500);
    finish();
  };

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i += 16) sum += input[i] * input[i];
    h.onLevel?.(Math.min(1, Math.sqrt(sum / (input.length / 16)) * 4));
    if (!stopped && ws.readyState === WebSocket.OPEN) ws.send(audioEventFrame(toPcm16(input, ctx.sampleRate, targetRate)));
  };

  ws.onmessage = (e) => {
    let u;
    try {
      u = readTranscribeFrame(e.data as ArrayBuffer);
    } catch {
      return;
    }
    if (!u) return;
    if ("error" in u) {
      h.onError("Voice input stopped unexpectedly. Please try again.");
      return stop();
    }
    if (!u.partial) finals.push(u.text);
    h.onTranscript([...finals, u.partial ? u.text : ""].join(" ").trim(), !u.partial);
  };
  ws.onclose = () => {
    stopped = true;
    finish();
  };

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("We couldn't connect to voice input. Please try again."));
  }).catch((err) => {
    finish();
    throw err;
  });
  source.connect(processor);
  processor.connect(ctx.destination);
  setTimeout(stop, (data.maxSeconds ?? 60) * 1000);
  return { stop };
}

// ---------- speaking ----------

let player: HTMLAudioElement | null = null;
let current: { id: string; onEnd?: () => void } | null = null;

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  return player;
}

/** A tiny valid silent WAV (0.05 s), built once. */
let silence: string | null = null;
function silentWav(): string {
  if (silence) return silence;
  const samples = 400;
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const str = (o: number, t: string) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  buf.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 8000, true);
  buf.setUint32(28, 16000, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, "data");
  buf.setUint32(40, samples * 2, true);
  let bin = "";
  new Uint8Array(buf.buffer).forEach((b) => (bin += String.fromCharCode(b)));
  return (silence = `data:audio/wav;base64,${btoa(bin)}`);
}

/**
 * Call from a click handler before voice mode starts: some browsers (Safari)
 * only allow audio that was first started by a tap, so this primes the player.
 */
export function unlockAudio() {
  const a = getPlayer();
  a.src = silentWav();
  a.play().catch(() => {});
}

export function stopSpeaking() {
  const a = player;
  if (a) {
    a.pause();
    a.removeAttribute("src");
    a.load();
  }
  const c = current;
  current = null;
  c?.onEnd?.();
}

export function speakingId(): string | null {
  return current?.id ?? null;
}

/** Reads one of the agent's replies aloud (streams, so it starts quickly). Stops anything already playing. */
export function speakMessage(messageId: string, h: { onStart?: () => void; onEnd?: () => void; onError?: (message: string) => void } = {}) {
  stopSpeaking();
  const a = getPlayer();
  current = { id: messageId, onEnd: h.onEnd };
  const mine = () => current?.id === messageId;
  a.onplaying = () => mine() && h.onStart?.();
  a.onended = () => {
    if (!mine()) return;
    current = null;
    h.onEnd?.();
  };
  a.onerror = () => {
    if (!mine()) return;
    current = null;
    h.onError?.("Voice playback isn't available right now.");
    h.onEnd?.();
  };
  a.src = `/api/agent/speech?m=${encodeURIComponent(messageId)}`;
  a.play().catch(() => {
    if (!mine()) return;
    current = null;
    h.onError?.("Your browser blocked audio. Tap the speaker to play it.");
    h.onEnd?.();
  });
}
