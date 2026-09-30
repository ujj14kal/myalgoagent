"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Hand, Mic, Square, X } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";
import { toSpeech } from "@/lib/ai/speech-text";
import { endOfTurnDelay, isEcho, wordCount } from "@/lib/ai/turn-taking";
import { speakMessage, startListening, stopSpeaking, type Listener } from "./voice-client";

type Phase = "connecting" | "listening" | "thinking" | "speaking" | "review" | "idle";

/** A fresh microphone session starts this long before the old one's time limit, so there's never a gap. */
const RENEW_MS = 50_000;
/** With nobody talking for this long the microphone is released (it's billed while it streams). */
const IDLE_MS = 90_000;
/** After the agent stops talking, its own last words may still be arriving from the microphone. */
const ECHO_GRACE_MS = 1200;

/**
 * Hands-free conversation with the microphone open the whole time:
 *  - you can talk over the agent to interrupt it (it stops and listens);
 *  - if you add something while it's still thinking, that answer is dropped and
 *    your follow-up goes next — the conversation history carries the context;
 *  - the agent's own voice coming back through the speakers isn't mistaken for you.
 * It goes through exactly the same agent as typing (same rules, tools and review
 * windows); when a review window opens it waits, then carries on.
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
  const sessionSeq = useRef(0);
  const activeSession = useRef(0);
  const failures = useRef(0);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef("");
  const captionRef = useRef("");
  const echoUntil = useRef(0);
  const lastActivity = useRef(0);
  const sentAfterReply = useRef<string | null>(lastReply?.id ?? null);
  const lastReplyIdRef = useRef<string | null>(lastReply?.id ?? null);
  const awaiting = useRef(false); // a question is out and its answer hasn't come back
  const superseded = useRef(false); // you spoke again: don't read the answer to the earlier question
  const queued = useRef(""); // what you said while an answer was still on its way
  const barged = useRef(false); // speech was cut short by you, not finished
  const alive = useRef(true);
  const sessionEndedRef = useRef<() => void>(() => {});
  const isPendingRef = useRef(isPending);
  const reviewOpenRef = useRef(reviewOpen);
  const phaseRef = useRef<Phase>("connecting");
  useEffect(() => {
    lastReplyIdRef.current = lastReply?.id ?? null;
    isPendingRef.current = isPending;
  });
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearTurnTimer = () => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = null;
  };

  /** Puts a question to the agent. */
  const dispatch = (text: string) => {
    lastActivity.current = Date.now();
    sentAfterReply.current = lastReplyIdRef.current;
    awaiting.current = true;
    superseded.current = false;
    setHeard(text);
    setCaption("");
    captionRef.current = "";
    setPhaseBoth("thinking");
    onSend(text);
  };

  /** The turn is over: send what was heard (after whatever was said while an answer was on its way). */
  const sendHeard = () => {
    clearTurnTimer();
    if (phaseRef.current !== "listening") return;
    const text = heardRef.current.trim();
    if (!text) return;
    listener.current?.endTurn();
    heardRef.current = "";
    const full = [queued.current, text].filter(Boolean).join(" ");
    if (awaiting.current || isPendingRef.current) {
      // The earlier answer is still coming: hold this until it lands, then send straight away.
      queued.current = full;
      setHeard(full);
      setPhaseBoth("thinking");
      return;
    }
    queued.current = "";
    dispatch(full);
  };
  const sendHeardRef = useRef(sendHeard);
  useEffect(() => {
    sendHeardRef.current = sendHeard;
  });

  const onTranscript = (text: string, final: boolean) => {
    const p = phaseRef.current;
    if (p === "connecting") return;
    if (p === "review") {
      if (final) listener.current?.endTurn(); // not for the agent: drop it
      return;
    }
    const agentVoiceStillAround = p === "speaking" || Date.now() < echoUntil.current;
    if (agentVoiceStillAround && isEcho(text, captionRef.current)) {
      if (final) listener.current?.endTurn();
      return;
    }
    if (p === "speaking") {
      // You're talking over the agent: it stops and listens.
      barged.current = true;
      stopSpeaking();
      setPhaseBoth("listening");
    } else if (p === "thinking") {
      // You added something while it was still working: the earlier answer is no longer wanted.
      if (!final && wordCount(text) < 2) return;
      superseded.current = true;
      setPhaseBoth("listening");
    } else if (p === "idle") {
      setPhaseBoth("listening");
    }
    lastActivity.current = Date.now();
    heardRef.current = text;
    setHeard(text);
    clearTurnTimer();
    // A finished phrase ends the turn after a short pause — longer if it sounds unfinished.
    if (final) turnTimer.current = setTimeout(() => sendHeardRef.current(), endOfTurnDelay(text));
  };
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  /** Opens a microphone session. Its events only count while it is the current one. */
  const connect = useCallback(async () => {
    const token = ++sessionSeq.current;
    const l = await startListening({
      onTranscript: (t, f) => token === activeSession.current && onTranscriptRef.current(t, f),
      onLevel: (v) => token === activeSession.current && setLevel(v),
      onError: (m) => token === activeSession.current && setProblem(m),
      onEnd: () => token === activeSession.current && sessionEndedRef.current(),
    });
    return { l, token };
  }, []);

  const scheduleRenew = () => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = setTimeout(async () => {
      if (!alive.current) return;
      try {
        const { l, token } = await connect();
        if (!alive.current) return l.stop();
        const old = listener.current;
        activeSession.current = token;
        listener.current = l;
        old?.stop(); // its end is ignored: it's no longer the current session
        scheduleRenew();
      } catch {
        // Keep the old session; if it runs out, sessionEnded starts a new one.
      }
    }, RENEW_MS);
  };

  /** Starts listening (first time, or after it stopped). The phase is only touched when nothing else is going on. */
  const begin = useCallback(async () => {
    if (!alive.current || listener.current) return;
    setProblem(null);
    if (phaseRef.current === "idle" || phaseRef.current === "connecting") setPhaseBoth("connecting");
    try {
      const { l, token } = await connect();
      if (!alive.current) return l.stop();
      activeSession.current = token;
      listener.current = l;
      lastActivity.current = Date.now();
      failures.current = 0;
      if (phaseRef.current === "connecting" || phaseRef.current === "idle") setPhaseBoth("listening");
      scheduleRenew();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Voice isn't available right now.");
      if (phaseRef.current === "connecting") setPhaseBoth("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  /** The current session ended by itself (time limit or dropped connection). */
  const sessionEnded = () => {
    listener.current = null;
    setLevel(0);
    if (!alive.current) return;
    if (phaseRef.current === "listening" && heardRef.current.trim()) sendHeardRef.current();
    if (++failures.current > 3) {
      setProblem("Voice input stopped. Tap the mic to start again.");
      if (phaseRef.current === "listening") setPhaseBoth("idle");
      return;
    }
    void begin();
  };
  useEffect(() => {
    sessionEndedRef.current = sessionEnded;
  });

  // Start listening as soon as voice mode opens; clean everything up on exit.
  useEffect(() => {
    alive.current = true;
    const t = setTimeout(() => void begin(), 0);
    return () => {
      alive.current = false;
      clearTimeout(t);
      clearTurnTimer();
      if (renewTimer.current) clearTimeout(renewTimer.current);
      activeSession.current = -1;
      listener.current?.stop();
      listener.current = null;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nobody has said anything for a while: let the microphone go until they tap it again.
  useEffect(() => {
    const id = setInterval(() => {
      if (!alive.current || phaseRef.current !== "listening" || !listener.current || heardRef.current) return;
      if (Date.now() - lastActivity.current < IDLE_MS) return;
      if (renewTimer.current) clearTimeout(renewTimer.current);
      activeSession.current = -1; // its end is ignored
      listener.current.stop();
      listener.current = null;
      setLevel(0);
      setPhaseBoth("idle");
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const afterSpeaking = useCallback(() => {
    if (!alive.current) return;
    if (barged.current) {
      barged.current = false; // you cut it short: you're already being heard
      return;
    }
    echoUntil.current = Date.now() + ECHO_GRACE_MS;
    lastActivity.current = Date.now();
    if (reviewOpenRef.current) {
      setPhaseBoth("review");
      return;
    }
    setPhaseBoth("listening");
    if (!listener.current) void begin();
  }, [begin]);

  useEffect(() => {
    reviewOpenRef.current = reviewOpen;
    // The review window closed without leaving the page: carry on the conversation.
    if (!reviewOpen && phaseRef.current === "review") {
      const t = setTimeout(() => {
        setPhaseBoth("listening");
        if (!listener.current) void begin();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [reviewOpen, begin]);

  // An answer arrived: read it aloud — unless you've already moved on.
  useEffect(() => {
    if (isPending || !awaiting.current || !lastReply || lastReply.id === sentAfterReply.current) return;
    awaiting.current = false;
    sentAfterReply.current = lastReply.id;
    const t = setTimeout(() => {
      if (!alive.current) return;
      if (queued.current && !heardRef.current) {
        // You said something while it was thinking: skip this answer and send your follow-up now.
        const next = queued.current;
        queued.current = "";
        dispatch(next);
        return;
      }
      if (superseded.current || phaseRef.current !== "thinking") return; // you're mid-sentence: your follow-up goes when you finish
      const spoken = toSpeech(lastReply.content);
      setCaption(spoken);
      captionRef.current = spoken;
      setPhaseBoth("speaking");
      speakMessage(lastReply.id, { onEnd: afterSpeaking, onError: (m) => setProblem(m) }, lastReply.content);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastReply, isPending, afterSpeaking]);

  // Sending failed (rate limit, network): show why; the microphone stays open.
  useEffect(() => {
    if (!sendError || !awaiting.current) return;
    const t = setTimeout(() => {
      awaiting.current = false;
      queued.current = "";
      setProblem(sendError);
      setPhaseBoth("listening");
    }, 0);
    return () => clearTimeout(t);
  }, [sendError]);

  const primary = () => {
    if (phase === "listening") return heardRef.current.trim() ? sendHeard() : undefined;
    if (phase === "speaking") {
      barged.current = true;
      stopSpeaking();
      setPhaseBoth("listening");
      return;
    }
    if (phase === "idle" || phase === "review") {
      setPhaseBoth(listener.current ? "listening" : "connecting");
      if (!listener.current) void begin();
    }
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
      ? "Thinking… you can keep talking"
      : phase === "speaking"
      ? `${agentName} is speaking — talk any time to interrupt`
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
        Voice uses Amazon Transcribe and Amazon Polly; headphones avoid echo. Replies are AI-generated and not investment advice.
      </p>
    </motion.div>
  );
}
