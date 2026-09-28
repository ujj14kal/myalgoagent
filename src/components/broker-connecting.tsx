"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Clock, FlaskConical, Globe, LineChart, RefreshCw, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import Agent2D from "@/components/robot/agent-2d";
import BrokerFailureCard from "@/components/broker-failure-card";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";
import { completeBrokerLogin, phoneApprovalStatus, startBrokerLogin, type ConnectedAccount } from "@/lib/broker-actions";
import type { BrokerInfo, LoginMethodId } from "@/lib/brokers/catalog";
import type { Failure } from "@/lib/brokers/failures";

type Phase = { kind: "working" } | { kind: "connected"; account: ConnectedAccount } | { kind: "failed"; failure: Failure };

const REDIRECT_STEPS = ["Back from {broker}", "Verifying your login", "Getting today’s secure session", "Checking your account"];
const APPROVAL_STEPS = ["Using the key you approved on {broker}", "Signing the request", "Getting today’s secure session", "Checking your account"];
const TOTP_STEPS = ["Creating today’s one-time code", "Sending it to {broker}", "Getting today’s secure session", "Checking your account"];
const POLL_MS = 3000;
// Stop polling after this long on one screen; the approval itself stays open until Upstox lapses it.
const PHONE_GIVE_UP_MS = 15 * 60_000;
const STEP_COUNT = REDIRECT_STEPS.length; // both flows have the same number of steps
const STEP_MS = 650;
// How long the agent celebrates on the card before flying back to its home.
const CELEBRATE_MS = 2600;

function BrokerMark({ broker, size = 64 }: { broker: BrokerInfo; size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-2xl bg-white shadow-[0_10px_30px_-12px_rgba(14,27,45,0.35)] ring-1 ring-black/[0.06]" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
      <img src={broker.logo} alt={`${broker.name} logo`} style={{ width: size * 0.62, height: size * 0.62 }} className="object-contain" />
    </span>
  );
}

/** Dots travelling between the broker and the agent while we connect. */
function Link2Anim({ state }: { state: "working" | "connected" | "failed" }) {
  const reduce = useReducedMotion();
  const color = state === "connected" ? "bg-brand-buy" : state === "failed" ? "bg-brand-sell/60" : "bg-brand-primary";
  return (
    <div className="relative mx-2 h-1 w-20 overflow-hidden rounded-full bg-brand-navy/[0.08] sm:w-32">
      {state === "working" && !reduce ? (
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={`absolute top-0 h-1 w-3 rounded-full ${color}`}
            initial={{ left: "-15%" }}
            animate={{ left: "110%" }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
          />
        ))
      ) : (
        <motion.span className={`absolute inset-y-0 left-0 rounded-full ${color}`} initial={{ width: "0%" }} animate={{ width: state === "failed" ? "45%" : "100%" }} transition={{ duration: 0.5 }} />
      )}
    </div>
  );
}

function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const colors = ["#471898", "#d4af37", "#16a34a", "#6a35c2", "#f59e0b"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const dist = 110 + (i % 4) * 30;
        return (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-[2px]"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.7 + 40, opacity: 0, rotate: 260, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.15, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export default function BrokerConnecting({ broker, query, method = null }: { broker: BrokerInfo; query: Record<string, string>; method?: LoginMethodId | null }) {
  const STEPS = method === "totp" ? TOTP_STEPS : broker.flow === "approval" ? APPROVAL_STEPS : REDIRECT_STEPS;
  const phone = method === "phone" && query.wait === "phone";
  const [waitedMs, setWaitedMs] = useState(0);
  const { agentName, flyHome } = useAgentChat();
  const [phase, setPhase] = useState<Phase>({ kind: "working" });
  const [step, setStep] = useState(0);
  const [agentHome, setAgentHome] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [retryFailure, setRetryFailure] = useState<Failure | null>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // Stops the phone-approval polling when the user leaves this screen.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Finish the login exactly once (React may run effects twice in development).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The one-time code is in the address bar — take it out of history right away.
    window.history.replaceState(null, "", window.location.pathname);
    const t0 = Date.now();
    if (phone) {
      // The user approves in the Upstox app; our notifier webhook finishes the login. Check until it has.
      const poll = async () => {
        if (!alive.current) return;
        const r = await phoneApprovalStatus(broker.id).catch(() => ({ state: "waiting" as const, sinceMs: Date.now() - t0 }));
        if (r.state === "connected") return setPhase({ kind: "connected", account: r.account });
        if (r.state === "failed") return setPhase({ kind: "failed", failure: r.failure });
        setWaitedMs(Date.now() - t0);
        if (Date.now() - t0 > PHONE_GIVE_UP_MS) return setPhase({ kind: "failed", failure: { code: "phone_not_approved" } });
        setTimeout(poll, POLL_MS);
      };
      void poll();
      return;
    }
    completeBrokerLogin(broker.id, query)
      .catch((): { ok: false; failure: Failure } => ({ ok: false, failure: { code: "unknown" } }))
      .then((r) => {
        // Let the progress steps play through so the outcome doesn't flash.
        const wait = Math.max(0, STEP_COUNT * STEP_MS - (Date.now() - t0));
        setTimeout(() => setPhase(r.ok ? { kind: "connected", account: r.account } : { kind: "failed", failure: r.failure }), wait);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per visit
  }, [broker.id, query]);

  useEffect(() => {
    if (phase.kind !== "working" || phone) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEP_COUNT - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [phase.kind, phone]);

  // Celebrate, then the agent flies back to its home (bottom-left on desktop).
  useEffect(() => {
    if (phase.kind !== "connected") return;
    const id = setTimeout(() => {
      const r = agentRef.current?.getBoundingClientRect();
      flyHome(r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
      setAgentHome(true);
    }, CELEBRATE_MS);
    return () => clearTimeout(id);
  }, [phase.kind, flyHome]);

  const retry = () =>
    startRetry(async () => {
      setRetryFailure(null);
      try {
        const r = await startBrokerLogin(broker.id);
        if (r.ok && r.loginUrl) window.location.assign(r.loginUrl);
        else if (!r.ok) setRetryFailure(r.failure ?? { code: "unknown", detail: r.error });
      } catch {
        setRetryFailure({ code: "unknown" });
      }
    });

  const linkState = phase.kind === "working" ? "working" : phase.kind;
  const pose = phase.kind === "connected" ? "happy" : phase.kind === "failed" ? "sad" : "working";

  return (
    <div className="mx-auto max-w-2xl py-4">
      <Link href="/app/broker-connections" className="inline-flex items-center gap-1.5 text-sm text-brand-navy/55 hover:text-brand-primary">
        <ArrowLeft size={15} /> Broker Connections
      </Link>

      <div className="surface relative mt-4 overflow-hidden px-6 pb-7 pt-8 text-center">
        {phase.kind === "connected" && <Confetti />}

        <div className="flex items-center justify-center">
          <BrokerMark broker={broker} />
          <Link2Anim state={linkState} />
          <div ref={agentRef} className="flex h-[88px] w-[88px] items-center justify-center">
            <AnimatePresence mode="popLayout">
              {!agentHome && (
                <motion.div
                  key={pose}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={phase.kind === "connected" ? { scale: [0.8, 1.15, 1], opacity: 1, y: [0, -10, 0] } : { scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.6 }}
                >
                  <Agent2D pose={pose} size={88} trackCursor={false} />
                </motion.div>
              )}
            </AnimatePresence>
            {agentHome && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-buy text-white shadow-[0_8px_24px_-8px_rgba(22,163,74,0.7)]">
                <Check size={28} strokeWidth={3} />
              </motion.span>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {phase.kind === "working" && phone && (
            <motion.div key="phone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}>
              <motion.span
                className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary"
                animate={{ rotate: [0, -8, 8, -6, 6, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.6 }}
              >
                <Smartphone size={26} />
              </motion.span>
              <p className="mt-4 text-lg font-semibold text-brand-navy">Approve on your phone</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-brand-navy/60">
                We&rsquo;ve asked {broker.name} to send you an approval request — in the {broker.name} app and on WhatsApp. Tap <strong>Approve</strong> and this page connects by itself.
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-bg px-3 py-1 text-xs text-brand-navy/55">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary" />
                Waiting for your approval · {Math.floor(waitedMs / 60_000)}:{String(Math.floor((waitedMs % 60_000) / 1000)).padStart(2, "0")}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={retrying}
                  onClick={retry}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-brand-navy ring-1 ring-brand-navy/15 hover:bg-brand-navy/5 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={retrying ? "animate-spin" : ""} /> Send the request again
                </button>
                <Link href={`/app/broker-connections?broker=${broker.id}`} className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/5">
                  Use {broker.name}&rsquo;s login page instead
                </Link>
              </div>
            </motion.div>
          )}

          {phase.kind === "working" && !phone && (
            <motion.div key="working" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}>
              <p className="mt-6 text-lg font-semibold text-brand-navy">Connecting your {broker.name} account…</p>
              <p className="mt-1 text-sm text-brand-navy/55">This takes a few seconds. Please keep this tab open.</p>
              <ul className="mx-auto mt-6 max-w-xs space-y-2.5 text-left">
                {STEPS.map((label, i) => (
                  <li key={label} className={`flex items-center gap-2.5 text-sm transition-colors ${i <= step ? "text-brand-navy" : "text-brand-navy/35"}`}>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        i < step ? "bg-brand-buy text-white" : i === step ? "ring-2 ring-brand-primary" : "ring-1 ring-brand-navy/15"
                      }`}
                    >
                      {i < step ? <Check size={12} strokeWidth={3} /> : i === step ? <span className="h-2 w-2 animate-pulse rounded-full bg-brand-primary" /> : null}
                    </span>
                    {label.replace("{broker}", broker.name)}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {phase.kind === "connected" && (
            <motion.div key="connected" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
              <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand-buy/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-buy">
                <Sparkles size={13} /> Connected
              </p>
              <p className="mt-3 text-2xl font-semibold text-brand-navy">{broker.name} is connected!</p>
              <p className="mt-1 text-sm text-brand-navy/60">
                {phase.account.accountName ? `Signed in as ${phase.account.accountName}. ` : ""}
                {agentName} can now see your {broker.name} account.
              </p>

              <dl className="mx-auto mt-6 grid max-w-md gap-2 text-left sm:grid-cols-2">
                {phase.account.brokerClientId && (
                  <div className="rounded-xl bg-brand-bg/70 px-3.5 py-2.5 ring-1 ring-black/[0.04]">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Client ID</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-brand-navy">{phase.account.brokerClientId}</dd>
                  </div>
                )}
                {phase.account.sessionUntil && (
                  <div className={`rounded-xl bg-brand-bg/70 px-3.5 py-2.5 ring-1 ring-black/[0.04] ${phase.account.brokerClientId ? "" : "sm:col-span-2"}`}>
                    <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
                      <Clock size={11} /> Today’s session
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-brand-navy">Until {phase.account.sessionUntil}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
                {[
                  { href: "/app/strategies/new", icon: LineChart, title: "Build a strategy", body: "Describe it or use the builder." },
                  { href: "/app/forward-testing", icon: FlaskConical, title: "Forward test it", body: "Test with notional capital first." },
                  { href: "/app/broker-connections", icon: ShieldCheck, title: "Manage connection", body: "Test, log in daily, disconnect." },
                ].map(({ href, icon: Icon, title, body }) => (
                  <Link key={title} href={href} className="surface surface-interactive p-3.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                      <Icon size={16} />
                    </span>
                    <p className="mt-2 text-sm font-semibold text-brand-navy">{title}</p>
                    <p className="text-xs text-brand-navy/55">{body}</p>
                  </Link>
                ))}
              </div>

              <div className="mt-6 space-y-2 text-left text-xs text-brand-navy/55">
                <p className="flex items-start gap-2">
                  <Clock size={13} className="mt-0.5 shrink-0 text-brand-primary" />
                  {broker.session} Your keys stay saved — it’s one click on Broker Connections.
                </p>
                <p className="flex items-start gap-2">
                  <Globe size={13} className="mt-0.5 shrink-0 text-brand-primary" />
                  Live order placement comes next and will also need a static IP on your broker account — we’ll guide you when it’s ready.
                </p>
              </div>
            </motion.div>
          )}

          {phase.kind === "failed" && (
            <motion.div key="failed" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-left">
              <p className="mt-6 text-center text-lg font-semibold text-brand-navy">We couldn’t connect {broker.name}</p>
              <p className="mt-1 text-center text-sm text-brand-navy/55">Nothing was changed on your {broker.name} account. Here’s what happened and how to fix it:</p>
              <div className="mt-5">
                <BrokerFailureCard brokerId={broker.id} brokerName={broker.name} failure={retryFailure ?? phase.failure} onRetry={retry} retrying={retrying} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
