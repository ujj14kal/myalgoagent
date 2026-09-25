"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hand, Mic, Square, X } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";
import { toSpeech } from "@/lib/ai/speech-text";
import { speakMessage, startListening, stopSpeaking, type Listener } from "./voice-client";

type Phase = "connecting" | "listening" | "thinking" | "speaking" | "review" | "idle";

/** Quiet time after the last words before the question is sent, like a natural pause. */
const END_OF_TURN_MS = 1300;

/**
 * Hands-free conversation: listen → send → read the reply aloud → listen again.
 * It goes through exactly the same agent as typing (same rules, tools and
 * review windows); when a review window opens it waits, then carries on.
 */
export default function VoiceMode({
  agentName,
  onSend,
  isPending,
  lastReply,
  reviewOpen,
  sendError,
  onExit,
}: {
  agentName: string;
  onSend: (text: string) => void;
  isPending: boolean;
  lastReply: { id: string; content: string } | null;
  reviewOpen: boolean;
  sendError: string | null;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [heard, setHeard] = useState("");
  const [caption, setCaption] = useState("");
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const listener = useRef<Listener | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef("");
  const sentAfterReply = useRef<string | null>(lastReply?.id ?? null);
  const alive = useRef(true);
  const lastReplyIdRef = useRef<string | null>(lastReply?.id ?? null);
  const reviewOpenRef = useRef(reviewOpen);
  useEffect(() => {
    lastReplyIdRef.current = lastReply?.id ?? null;
  }, [lastReply?.id]);
  const phaseRef = useRef<Phase>("connecting");
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearTurnTimer = () => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = null;
  };

  const stopListening = () => {
    clearTurnTimer();
    listener.current?.stop();
    listener.current = null;
    setLevel(0);
  };

  const sendHeard = useCallback(() => {
    const text = heardRef.current.trim();
    stopListening();
    if (!text) {
      setPhaseBoth("idle");
      return;
    }
    sentAfterReply.current = lastReplyIdRef.current;
    setCaption("");
    setPhaseBoth("thinking");
    onSend(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSend]);

  const listen = useCallback(async () => {
    if (!alive.current) return;
    stopSpeaking();
    stopListening();
    setProblem(null);
    setHeard("");
    heardRef.current = "";
    setPhaseBoth("connecting");
    try {
      const l = await startListening({
        onTranscript: (text, final) => {
          heardRef.current = text;
          setHeard(text);
          clearTurnTimer();
          // Send after a short pause once a phrase is complete.
          if (final) turnTimer.current = setTimeout(sendHeard, END_OF_TURN_MS);
        },
        onLevel: setLevel,
        onError: (m) => setProblem(m),
        onEnd: () => {
          // Timed out or closed while still listening: send what we have, or wait for a tap.
          if (phaseRef.current === "listening") {
            if (heardRef.current.trim()) sendHeard();
            else setPhaseBoth("idle");
          }
        },
      });
      if (!alive.current) return l.stop();
      listener.current = l;
      setPhaseBoth("listening");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Voice isn't available right now.");
      setPhaseBoth("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendHeard]);

  // Start listening as soon as voice mode opens; clean everything up on exit.
  useEffect(() => {
    alive.current = true;
    const t = setTimeout(listen, 0);
    return () => {
      alive.current = false;
      clearTimeout(t);
      stopListening();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterSpeaking = useCallback(() => {
    if (!alive.current) return;
    if (reviewOpenRef.current) setPhaseBoth("review");
    else listen();
  }, [listen]);

  useEffect(() => {
    reviewOpenRef.current = reviewOpen;
    // The review window closed without leaving the page: carry on the conversation.
    if (!reviewOpen && phaseRef.current === "review") {
      const t = setTimeout(listen, 0);
      return () => clearTimeout(t);
    }
  }, [reviewOpen, listen]);

  // A new reply arrived: read it aloud.
  useEffect(() => {
    if (phaseRef.current !== "thinking" || isPending || !lastReply || lastReply.id === sentAfterReply.current) return;
    sentAfterReply.current = lastReply.id;
    const t = setTimeout(() => {
      setCaption(toSpeech(lastReply.content));
      setPhaseBoth("speaking");
      speakMessage(lastReply.id, {
        onEnd: afterSpeaking,
        onError: (m) => setProblem(m),
      });
    }, 0);
    return () => clearTimeout(t);
  }, [lastReply, isPending, afterSpeaking]);

  // Sending failed (rate limit, network): show why and wait for a tap.
  useEffect(() => {
    if (!sendError || phaseRef.current !== "thinking") return;
    const t = setTimeout(() => {
      setProblem(sendError);
      setPhaseBoth("idle");
    }, 0);
    return () => clearTimeout(t);
  }, [sendError]);

  const primary = () => {
    if (phase === "listening") return heardRef.current.trim() ? sendHeard() : undefined;
    if (phase === "speaking") {
      stopSpeaking(); // its onEnd carries on listening
      return;
    }
    if (phase === "idle" || phase === "review") listen();
  };

  const pose: AgentPose =
    problem && phase === "idle" ? "sad" : phase === "thinking" ? "thinking" : phase === "speaking" ? "talk" : phase === "listening" ? "idle" : phase === "review" ? "point" : "wave";
  const status =
    phase === "connecting"
      ? "Getting ready…"
      : phase === "listening"
      ? heard
        ? "Listening… pause when you're done"
        : "Listening — go ahead"
      : phase === "thinking"
      ? "Thinking…"
      : phase === "speaking"
      ? `${agentName} is speaking — tap to interrupt`
      : phase === "review"
      ? "Review the window, then I'll keep listening"
      : "Tap the mic to talk";

  return (
    <motion.div
      key="voice"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex min-h-0 flex-1 flex-col items-center overflow-hidden bg-gradient-to-b from-brand-bg to-white px-6 pb-6 pt-8"
    >
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-primary/10 blur-3xl" />

      {/* the agent, with rings that follow your voice or its own */}
      <div className="relative mt-4 flex h-56 w-56 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-brand-primary/20"
            animate={
              phase === "listening"
                ? { scale: 0.78 + level * (0.35 + i * 0.12), opacity: 0.25 + level * 0.6 }
                : phase === "speaking"
                ? { scale: [0.8 + i * 0.07, 0.95 + i * 0.08, 0.8 + i * 0.07], opacity: [0.35, 0.7, 0.35] }
                : phase === "thinking"
                ? { rotate: 360, scale: 0.8 + i * 0.06, opacity: 0.3 }
                : { scale: 0.8 + i * 0.06, opacity: 0.18 }
            }
            transition={
              phase === "listening"
                ? { duration: 0.12 }
                : phase === "speaking"
                ? { duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }
                : phase === "thinking"
                ? { duration: 3 + i, repeat: Infinity, ease: "linear" }
                : { duration: 0.4 }
            }
            style={phase === "thinking" ? { borderStyle: "dashed" } : undefined}
          />
        ))}
        <Agent2D pose={pose} size={150} trackCursor={false} className="relative" />
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="relative mt-2 text-center text-xs font-semibold uppercase tracking-wider text-brand-primary/80"
          role="status"
        >
          {status}
        </motion.p>
      </AnimatePresence>

      <div className="relative mt-5 w-full max-w-xl flex-1 space-y-4 overflow-y-auto text-center [scrollbar-width:thin]">
        {heard && (phase === "listening" || phase === "connecting" || phase === "thinking") && (
          <p className="text-lg font-medium leading-relaxed text-brand-navy">&ldquo;{heard}&rdquo;</p>
        )}
        {caption && (phase === "speaking" || phase === "review" || phase === "idle") && (
          <p className="text-[15px] leading-relaxed text-brand-navy/70">{caption}</p>
        )}
        {problem && <p className="mx-auto max-w-sm rounded-lg bg-brand-sell/[0.06] px-3 py-2 text-xs font-medium text-brand-sell">{problem}</p>}
      </div>

      {/* controls */}
      <div className="relative mt-4 flex items-center gap-5">
        <motion.button
          type="button"
          onClick={primary}
          disabled={phase === "connecting" || phase === "thinking"}
          whileTap={{ scale: 0.92 }}
          aria-label={phase === "speaking" ? "Interrupt" : phase === "listening" ? "Send now" : "Talk"}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_10px_28px_-10px_rgba(71,24,152,0.7)] transition-colors disabled:opacity-50 ${
            phase === "listening" ? "bg-brand-sell" : "bg-brand-primary hover:bg-brand-primary-light"
          }`}
        >
          {phase === "speaking" ? <Hand size={24} /> : phase === "listening" ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
        </motion.button>
        <motion.button
          type="button"
          onClick={onExit}
          whileTap={{ scale: 0.92 }}
          aria-label="End voice mode"
          title="End voice mode"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-navy/70 ring-1 ring-black/10 hover:text-brand-navy"
        >
          <X size={20} />
        </motion.button>
      </div>
      <p className="relative mt-3 text-center text-[10.5px] leading-snug text-brand-navy/50">
        Voice uses Amazon Transcribe and Amazon Polly. Replies are AI-generated and not investment advice.
      </p>
    </motion.div>
  );
}
