"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import Agent2D from "@/components/robot/agent-2d";

// What the customer sees after Razorpay's window closes: we are confirming the payment (the agent thinks), then it is done
// (the agent is happy, a white tick pops into a purple circle, little dots drift off) and, for a plan, a proper welcome.
// The same four colours as the rest of the product: violet, white, gold and the navy behind.

export type PaymentOverlayState =
  | { kind: "processing"; what: string }
  | { kind: "success"; variant: "plan"; planLabel: string; perks: string[] }
  | { kind: "success"; variant: "topup"; credits: number; total?: number }
  | { kind: "error"; message: string };

const VIOLET = "#471898";
const GOLD = "#bda360";
const CONFETTI = [VIOLET, "#6a35c2", GOLD, "#ddc98c", "#ffffff"];

function Dots({ reduce }: { reduce: boolean }) {
  return (
    <span aria-hidden className="ml-1 inline-flex gap-1 align-middle">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-current" animate={reduce ? { opacity: 1 } : { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
      ))}
    </span>
  );
}

/** A burst of small dots from the middle: deterministic so it never jumps between renders. */
function Burst({ reduce }: { reduce: boolean }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
        const r = 120 + ((i * 37) % 90);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r - 30, size: 5 + ((i * 7) % 7), color: CONFETTI[i % CONFETTI.length], delay: (i % 7) * 0.03 };
      }),
    [],
  );
  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-[34%] h-0 w-0">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: d.size, height: d.size, background: d.color, left: -d.size / 2, top: -d.size / 2 }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: d.x, y: [0, d.y, d.y + 60], opacity: [0, 1, 0], scale: [0, 1, 0.6] }}
          transition={{ duration: 1.9, delay: 0.25 + d.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/** The white tick inside a purple circle: the circle springs in, then the tick is drawn. */
function Tick({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      className="absolute -bottom-1 -right-1 grid h-16 w-16 place-items-center rounded-full shadow-lg ring-4 ring-white"
      style={{ background: VIOLET }}
      initial={reduce ? false : { scale: 0, rotate: -40 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.35 }}
    >
      <svg viewBox="0 0 64 64" className="h-9 w-9" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M16 34 L28 46 L49 21" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.7, ease: "easeOut" }} />
      </svg>
    </motion.div>
  );
}

export default function PaymentOverlay({ state, onClose }: { state: PaymentOverlayState | null; onClose: () => void }) {
  const reduce = !!useReducedMotion();
  const done = state?.kind === "success" || state?.kind === "error";
  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [state, done, onClose]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          key="overlay"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-label={state.kind === "processing" ? "Confirming your payment" : state.kind === "success" ? "Payment successful" : "Payment problem"}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "radial-gradient(circle at 50% 30%, rgba(71,24,152,0.94), rgba(14,27,45,0.97) 70%)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {state.kind === "success" && <Burst reduce={reduce} />}
          <motion.div
            className="relative w-full max-w-md rounded-3xl bg-white px-7 pb-8 pt-9 text-center shadow-2xl"
            initial={reduce ? false : { y: 30, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
          >
            {done && (
              <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1.5 text-brand-navy/40 transition hover:bg-brand-navy/5 hover:text-brand-navy">
                <X size={18} />
              </button>
            )}

            <div className="relative mx-auto mb-7 h-[170px] w-[150px]">
              <Agent2D pose={state.kind === "processing" ? "thinking" : state.kind === "success" ? "happy" : "sad"} size={150} trackCursor={false} />
              {state.kind === "success" && <Tick reduce={reduce} />}
            </div>

            {state.kind === "processing" && (
              <div className="mt-5">
                <p className="text-xl font-bold text-brand-navy">
                  Confirming your payment<Dots reduce={reduce} />
                </p>
                <p className="mt-2 text-sm text-brand-navy/60">Setting up {state.what}. This takes a moment — please keep this window open.</p>
              </div>
            )}

            {state.kind === "success" && state.variant === "plan" && (
              <motion.div className="mt-5" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>Payment received</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy">
                  Welcome to{" "}
                  <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${VIOLET}, #8a52e0 55%, ${GOLD})` }}>
                    {state.planLabel}
                  </span>
                </h2>
                <div className="mx-auto mt-3 h-[3px] w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${VIOLET}, ${GOLD})` }} />
                <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-brand-navy/80">
                  {state.perks.map((p, i) => (
                    <motion.li key={p} className="flex items-start gap-2.5" initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.1 }}>
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-white" style={{ background: VIOLET }}>
                        <Check size={11} strokeWidth={3.5} />
                      </span>
                      {p}
                    </motion.li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-brand-navy/50">Your invoice is on its way to your email.</p>
              </motion.div>
            )}

            {state.kind === "success" && state.variant === "topup" && (
              <motion.div className="mt-5" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>Payment received</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy">
                  <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${VIOLET}, #8a52e0 60%, ${GOLD})` }}>
                    +{state.credits.toLocaleString("en-IN")}
                  </span>{" "}
                  credits added
                </h2>
                <p className="mt-2 text-sm text-brand-navy/65">They&apos;re in your account now and stay for a year. Your invoice is on its way to your email.</p>
              </motion.div>
            )}

            {state.kind === "error" && (
              <div className="mt-5">
                <p className="text-xl font-bold text-brand-navy">That didn&apos;t go through</p>
                <p className="mt-2 text-sm text-brand-navy/65">{state.message}</p>
                <p className="mt-2 text-xs text-brand-navy/45">If money left your account it will be returned automatically, or write to support@myalgoagent.com and we&apos;ll sort it out.</p>
              </div>
            )}

            {done && (
              <motion.button
                type="button"
                onClick={onClose}
                className="mt-7 inline-flex min-w-40 items-center justify-center rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-light"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: state.kind === "success" ? 1.1 : 0.2 }}
                autoFocus
              >
                {state.kind === "success" ? "Let's go" : "Close"}
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
