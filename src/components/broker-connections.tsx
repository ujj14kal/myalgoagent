"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Lock,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import Agent2D from "@/components/robot/agent-2d";
import BodyPortal from "@/components/ui/body-portal";
import BrokerFailureCard from "@/components/broker-failure-card";
import type { Failure } from "@/lib/brokers/failures";
import { callbackUrl, loginView, type BrokerId, type BrokerInfo, type LoginMethodId } from "@/lib/brokers/catalog";
import { disconnectBroker, saveBrokerKeys, startBrokerLogin, testBrokerConnection, type BrokerActionResult } from "@/lib/broker-actions";

export type ConnectionView = {
  broker: string;
  state: "connected" | "expired" | "keys_saved" | "error";
  apiKeyHint: string;
  accountName: string | null;
  brokerClientId: string | null;
  sessionUntil: string | null;
  lastCheckedAt: string | null;
  failure: Failure | null;
  loginMethod: LoginMethodId | null;
};

type View = ReturnType<typeof loginView>;

const STATE_BADGE: Record<ConnectionView["state"] | "none" | "next", { label: string; className: string }> = {
  connected: { label: "Connected", className: "bg-brand-buy/10 text-brand-buy ring-brand-buy/20" },
  expired: { label: "Log in for today", className: "bg-brand-gold/15 text-[#8a7437] ring-brand-gold/30" },
  keys_saved: { label: "Keys saved", className: "bg-brand-primary/10 text-brand-primary ring-brand-primary/20" },
  error: { label: "Needs attention", className: "bg-brand-sell/10 text-brand-sell ring-brand-sell/20" },
  none: { label: "Not connected", className: "bg-brand-navy/5 text-brand-navy/50 ring-brand-navy/10" },
  next: { label: "Coming next", className: "bg-brand-navy/5 text-brand-navy/45 ring-brand-navy/10" },
};

function Badge({ kind }: { kind: keyof typeof STATE_BADGE }) {
  const b = STATE_BADGE[kind];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${b.className}`}>{b.label}</span>;
}

function Logo({ broker, size = 40 }: { broker: BrokerInfo; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand marks */}
      <img src={broker.logo} alt={`${broker.name} logo`} className="object-contain" style={{ width: size * 0.66, height: size * 0.66 }} />
    </span>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-stretch overflow-hidden rounded-lg border border-brand-primary/30 bg-brand-primary/[0.04]">
      <code className="min-w-0 flex-1 select-all break-all px-3 py-2 text-[12.5px] text-brand-navy">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // Clipboard blocked — the text is selectable instead.
          }
        }}
        className="flex shrink-0 items-center gap-1.5 border-l border-brand-primary/20 bg-white px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function BrokerConnections({
  brokers,
  connections,
  origin,
  initialBroker,
  startEditing,
  signedOut,
  storageReady,
  notifierUrl,
}: {
  brokers: BrokerInfo[];
  connections: ConnectionView[];
  origin: string;
  initialBroker: string;
  /** Open the key form straight away (from a “Replace keys” link). */
  startEditing: boolean;
  /** The user came back from a broker login after being signed out. */
  signedOut: boolean;
  storageReady: boolean;
  /** This user's private Upstox notifier URL (for the phone-approval login). */
  notifierUrl: string | null;
}) {
  const [selectedId, setSelectedId] = useState(initialBroker);
  const selected = brokers.find((b) => b.id === selectedId) ?? brokers[0];
  const byBroker = new Map(connections.map((c) => [c.broker, c]));
  // The daily-login method picked per broker (starts at what the user saved).
  const [methods, setMethods] = useState<Record<string, LoginMethodId | null>>(() => Object.fromEntries(connections.map((c) => [c.broker, c.loginMethod])));
  const method = methods[selected.id] ?? null;
  const view = loginView(selected, method);
  const live = brokers.filter((b) => b.availability === "live");
  const next = brokers.filter((b) => b.availability === "next");

  const pick = (id: BrokerId) => {
    setSelectedId(id);
    document.getElementById("broker-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      {signedOut && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-navy">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#8a7437]" />
          <p>You were signed out of MyAlgoAgent while logging in at your broker, so that login couldn&rsquo;t be finished. Choose your broker below and click &ldquo;Log in&rdquo; again.</p>
        </div>
      )}

      {!storageReady && (
        <div className="flex items-start gap-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-navy">
          <Clock size={18} className="mt-0.5 shrink-0 text-[#8a7437]" />
          <p>Connecting is being switched on right now. You can already follow the guide below and create your broker API app — you&rsquo;ll paste the keys here shortly.</p>
        </div>
      )}

      {/* How it works */}
      <section className="surface p-5">
        <p className="text-sm font-semibold text-brand-navy">How connecting works</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Create an API app at your broker", "A free, two-minute step on your broker's developer page. It's your app, in your own account."],
            ["Paste our Redirect URL into it", "We give you the exact URL for your broker below. The broker sends you back to it after you log in."],
            ["Paste the API key and secret here", "They're encrypted on our servers and never shown again — not even to you."],
            ["Log in at your broker", "Password and 2FA happen on the broker's own page, never here. Repeat this login once each trading day."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-black/[0.06] bg-brand-bg/60 p-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">{i + 1}</span>
              <p className="mt-2 text-sm font-semibold text-brand-navy">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-navy/60">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Broker grid */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-navy/45">Choose your broker</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...live, ...next].map((b) => {
            const conn = byBroker.get(b.id);
            const active = b.id === selected.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => pick(b.id)}
                aria-pressed={active}
                className={`surface surface-interactive flex flex-col items-start gap-2.5 p-3.5 text-left ${active ? "ring-2 ring-brand-primary" : ""} ${b.availability === "next" ? "opacity-80" : ""}`}
              >
                <div className="flex w-full items-center gap-2.5">
                  <Logo broker={b} />
                  <span className="min-w-0 truncate text-sm font-semibold text-brand-navy">{b.name}</span>
                </div>
                <Badge kind={b.availability === "next" ? "next" : (conn?.state ?? "none")} />
              </button>
            );
          })}
        </div>
      </section>

      {/* Setup for the selected broker */}
      <section id="broker-setup" className="scroll-mt-20 grid gap-6 lg:grid-cols-5">
        <div className="surface min-w-0 p-5 lg:col-span-3">
          <div className="flex items-center gap-3">
            <Logo broker={selected} size={44} />
            <div>
              <p className="text-base font-semibold text-brand-navy">Connect {selected.name}</p>
              <a href={selected.portal.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline">
                Open {selected.portal.label} <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {selected.altLogin && selected.availability === "live" && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/45">How do you want to log in each day?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup">
                {[
                  { id: null, label: selected.altLogin.defaultLabel, summary: selected.altLogin.defaultSummary },
                  { id: selected.altLogin.id, label: selected.altLogin.label, summary: selected.altLogin.summary },
                ].map((o) => {
                  const on = method === o.id;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMethods((m) => ({ ...m, [selected.id]: o.id }))}
                      className={`rounded-xl border p-3 text-left transition-colors ${on ? "border-brand-primary bg-brand-primary/[0.05] ring-1 ring-brand-primary" : "border-black/[0.08] hover:bg-brand-bg"}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${on ? "border-brand-primary" : "border-brand-navy/25"}`}>{on && <span className="h-2 w-2 rounded-full bg-brand-primary" />}</span>
                        {o.label}
                      </span>
                      <span className="mt-1 block text-xs text-brand-navy/60">{o.summary}</span>
                    </button>
                  );
                })}
              </div>
              {method && (
                <p className="mt-2 flex gap-2 rounded-xl bg-brand-gold/10 px-3 py-2.5 text-xs leading-relaxed text-brand-navy/75 ring-1 ring-brand-gold/25">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#8a7437]" />
                  {selected.altLogin.tradeoff}
                </p>
              )}
            </div>
          )}

          <ol className="mt-5 space-y-4">
            {view.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">{i + 1}</span>
                <div className="min-w-0 flex-1 pt-0.5 text-sm text-brand-navy/80">
                  {step === "PASTE_CALLBACK" ? (
                    <>
                      <p>
                        In the <strong className="text-brand-navy">{selected.callbackFieldName}</strong> field, paste this URL exactly:
                      </p>
                      <CopyField value={callbackUrl(origin, selected.id)} />
                      <p className="mt-1.5 text-xs text-brand-navy/50">
                        It must match character for character — <code>https</code>, no extra slash at the end, no spaces. A mismatch is the most common reason a login fails.
                      </p>
                    </>
                  ) : step === "PASTE_NOTIFIER" ? (
                    <>
                      <p>
                        In the <strong className="text-brand-navy">Notifier Webhook URL</strong> field, paste your private URL:
                      </p>
                      {notifierUrl ? <CopyField value={notifierUrl} /> : <p className="mt-1.5 text-xs text-brand-navy/50">Your URL appears here once connecting is switched on.</p>}
                      <p className="mt-1.5 text-xs text-brand-navy/50">It&rsquo;s unique to your account — don&rsquo;t share it. Upstox sends today&rsquo;s session here when you tap Approve.</p>
                    </>
                  ) : (
                    <p>{step}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <InfoTile icon={KeyRound} title="Cost">{selected.cost}</InfoTile>
            <InfoTile icon={Clock} title="Daily login">{view.session}</InfoTile>
          </div>
          {view.notes.map((n) => (
            <p key={n} className="mt-3 rounded-lg bg-brand-bg/70 px-3 py-2 text-xs text-brand-navy/60">
              {n}
            </p>
          ))}
        </div>

        <div className="min-w-0 lg:col-span-2">
          {selected.availability === "next" ? (
            <div className="surface p-5 text-sm text-brand-navy/70">
              <p className="font-semibold text-brand-navy">{selected.name} is coming next</p>
              <p className="mt-2">
                You can create your {selected.name} API app now using the steps on the left, with the Redirect URL above. When {selected.name} goes live here, you&rsquo;ll just paste your keys and log in.
              </p>
            </div>
          ) : (
            <ConnectPanel key={selected.id} broker={selected} view={view} conn={byBroker.get(selected.id)} disabled={!storageReady} startEditing={startEditing && selected.id === initialBroker} />
          )}
        </div>
      </section>

      {/* What to know */}
      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={Lock} title="What we store — and don't">
          Your API key, secret and each day&rsquo;s access token, encrypted (AES-256) and locked to your account. We never see or store your broker password, PIN or 2FA codes. Disconnect removes everything here; you can also delete the app on your broker&rsquo;s side to revoke access completely.
        </InfoCard>
        <InfoCard icon={RefreshCw} title="Why log in every day?">
          Exchange rules make every broker end API sessions daily (Zerodha at 6 AM, Upstox at 3:30 AM, others at midnight or after 24 hours). One click on &ldquo;Log in for today&rdquo; before the market opens is all it takes — your keys stay saved.
        </InfoCard>
        <InfoCard icon={Globe} title="Live orders & static IP">
          Connecting lets us verify your account today. Placing live orders through an API also needs a <strong>static IP</strong> registered on your broker account (a SEBI rule — each client has their own). We&rsquo;ll set that up for you when live trading turns on here; nothing is needed from you yet.
        </InfoCard>
      </section>

      <section className="surface p-5">
        <p className="text-sm font-semibold text-brand-navy">Common questions</p>
        <div className="mt-3 divide-y divide-black/[0.06]">
          {[
            ["Is MyAlgoAgent placing trades for me?", "No. You build your own strategy, see every rule, and choose to run it on your own account. Nothing trades unless you start it — and live trading isn't switched on yet."],
            ["The broker said “invalid redirect URL” or “redirect_uri mismatch”.", "The URL in your broker app doesn't exactly match ours. Copy it again with the Copy button, paste it into the Redirect URL field, save the app, then click “Log in” here again."],
            ["I got “That login took too long”.", "The login must finish within 10 minutes of clicking the button here. Just click Log in again."],
            ["I regenerated my keys at the broker.", "Old keys stop working immediately. Click “Replace keys”, paste the new ones and log in again."],
            ["Can I connect more than one broker?", "Yes — each broker is connected separately and you can disconnect any of them at any time."],
          ].map(([q, a]) => (
            <details key={q} className="group py-2.5">
              <summary className="cursor-pointer list-none text-sm font-medium text-brand-navy marker:hidden">
                <span className="mr-2 inline-block text-brand-primary transition-transform group-open:rotate-90">›</span>
                {q}
              </summary>
              <p className="mt-1.5 pl-5 text-sm text-brand-navy/65">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoTile({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-brand-bg/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-navy/45">
        <Icon size={13} /> {title}
      </p>
      <p className="mt-1 text-sm text-brand-navy/75">{children}</p>
    </div>
  );
}

function InfoCard({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
        <Icon size={16} />
      </span>
      <p className="mt-3 text-sm font-semibold text-brand-navy">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-navy/65">{children}</p>
    </div>
  );
}

/** Full-screen “taking you to your broker” moment while the login URL is prepared. */
function RedirectOverlay({ broker, method }: { broker: BrokerInfo; method: LoginMethodId | null }) {
  return (
    <BodyPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-navy/40 px-4 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
          <div className="flex items-center justify-center gap-3">
            <Agent2D pose="working" size={64} trackCursor={false} />
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-brand-primary" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
              ))}
            </span>
            <Logo broker={broker} size={56} />
          </div>
          <p className="mt-5 text-base font-semibold text-brand-navy">
            {method === "phone" ? `Asking ${broker.name} to notify your phone…` : broker.flow === "approval" || method === "totp" ? `Connecting to ${broker.name}…` : `Taking you to ${broker.name}…`}
          </p>
          <p className="mt-1.5 text-sm text-brand-navy/60">
            {method === "phone"
              ? `You'll get an approval request in the ${broker.name} app and on WhatsApp in a moment.`
              : method === "totp"
                ? `Creating today’s one-time code from your TOTP key and asking ${broker.name} for today’s session.`
                : broker.flow === "approval"
                  ? `Asking ${broker.name} for today’s session with the key you approved on ${broker.name}.`
                  : `Log in there with your ${broker.name} password and 2FA. ${broker.name} will bring you straight back here.`}
          </p>
        </motion.div>
      </motion.div>
    </BodyPortal>
  );
}

function ConnectPanel({ broker, view, conn, disabled, startEditing }: { broker: BrokerInfo; view: View; conn?: ConnectionView; disabled: boolean; startEditing: boolean }) {
  const router = useRouter();
  const method = view.method;
  const [editingRaw, setEditing] = useState(!conn || startEditing);
  // Switching the daily-login method needs the keys saved again (different keys for Groww TOTP).
  const editing = editingRaw || (!!conn && conn.loginMethod !== method);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [pending, start] = useTransition();

  function run(action: () => Promise<BrokerActionResult>, opts: { redirects?: boolean; onOk?: () => void } = {}) {
    setFormError(null);
    setFailure(null);
    setNotice(null);
    if (opts.redirects) setRedirecting(true);
    start(async () => {
      try {
        const r = await action();
        if (!r.ok) {
          setRedirecting(false);
          if (r.error) setFormError(r.error);
          else setFailure(r.failure ?? { code: "unknown" });
          router.refresh();
          return;
        }
        if (r.loginUrl) {
          // Keep the overlay up while the browser leaves for the broker.
          window.location.assign(r.loginUrl);
          return;
        }
        if (r.message) setNotice(r.message);
        opts.onOk?.();
        router.refresh();
      } catch {
        setRedirecting(false);
        setFailure({ code: "unknown" });
      }
    });
  }

  const login = () => run(() => startBrokerLogin(broker.id), { redirects: true });
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50";
  // A failure from this visit wins; otherwise show the one saved from the last attempt.
  const shownFailure = failure ?? (conn && conn.state !== "connected" ? conn.failure : null);

  const overlay = <AnimatePresence>{redirecting && <RedirectOverlay broker={broker} method={method} />}</AnimatePresence>;
  const instant = broker.flow === "approval" || method === "totp";

  if (conn && !editing) {
    return (
      <div className="space-y-4">
        {overlay}
        <div className="surface p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-navy">Your {broker.name} connection</p>
            <Badge kind={conn.state} />
          </div>
          {conn.state === "connected" && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-buy/[0.06] px-3 py-2.5 ring-1 ring-brand-buy/15">
              <Agent2D pose="happy" size={40} trackCursor={false} />
              <p className="text-sm text-brand-navy">
                All set{conn.accountName ? `, ${conn.accountName}` : ""}. Today&rsquo;s session is active{conn.sessionUntil ? ` until ${conn.sessionUntil}` : ""}.
              </p>
            </div>
          )}
          {conn.state === "expired" && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-gold/10 px-3 py-2.5 ring-1 ring-brand-gold/30">
              <Clock size={18} className="shrink-0 text-[#8a7437]" />
              <p className="text-sm text-brand-navy">Yesterday&rsquo;s session has ended. Log in once for today — your keys are still saved.</p>
            </div>
          )}
          <dl className="mt-4 space-y-2 text-sm">
            {conn.accountName && <Row label="Account">{conn.accountName}</Row>}
            {conn.brokerClientId && <Row label="Client ID">{conn.brokerClientId}</Row>}
            <Row label="API key">•••• {conn.apiKeyHint}</Row>
            <Row label="Session">{conn.sessionUntil ? `Active until ${conn.sessionUntil}` : "Not logged in today"}</Row>
            {conn.lastCheckedAt && <Row label="Last checked">{conn.lastCheckedAt}</Row>}
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            {conn.state === "connected" ? (
              <button type="button" disabled={pending || disabled} onClick={() => run(() => testBrokerConnection(broker.id))} className={`${btn} bg-brand-primary text-white hover:bg-brand-primary-light`}>
                <ShieldCheck size={15} className={pending ? "animate-pulse" : ""} /> {pending ? "Checking with " + broker.name + "…" : "Test connection"}
              </button>
            ) : (
              <button type="button" disabled={pending || disabled} onClick={login} className={`${btn} bg-brand-primary text-white hover:bg-brand-primary-light`}>
                <LogIn size={15} /> {method === "phone" ? "Send approval to my phone" : instant ? "Connect for today" : conn.state === "expired" ? "Log in for today" : `Log in to ${broker.name}`}
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => setEditing(true)} className={`${btn} border border-brand-navy/15 text-brand-navy hover:bg-brand-navy/5`}>
              <KeyRound size={15} /> Replace keys
            </button>
            {!confirmDisconnect && (
              <button type="button" disabled={pending} onClick={() => setConfirmDisconnect(true)} className={`${btn} text-brand-sell hover:bg-brand-sell/5`}>
                <Unplug size={15} /> Disconnect
              </button>
            )}
          </div>

          {confirmDisconnect && (
            <div className="mt-4 rounded-xl border border-brand-sell/20 bg-brand-sell/[0.04] p-3.5">
              <p className="text-sm text-brand-navy">
                Disconnect {broker.name}? Your saved keys and session are deleted from MyAlgoAgent. To revoke access completely, also delete the app on {broker.name}&rsquo;s developer page.
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => disconnectBroker(broker.id), { onOk: () => setEditing(true) })} className={`${btn} bg-brand-sell text-white hover:bg-brand-sell/90`}>
                  {pending ? "Disconnecting…" : "Yes, disconnect"}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirmDisconnect(false)} className={`${btn} text-brand-navy/60 hover:bg-brand-navy/5`}>
                  Keep it
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {notice && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-1.5 text-sm text-brand-buy">
                <CheckCircle2 size={15} /> {notice}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {shownFailure && <BrokerFailureCard compact brokerId={broker.id} brokerName={broker.name} failure={shownFailure} onRetry={login} onReplaceKeys={() => setEditing(true)} retrying={pending} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overlay}
      <form
        className="surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveBrokerKeys(broker.id, values, method), { redirects: true });
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-brand-navy">{conn ? `Replace your ${broker.name} keys` : `Paste your ${broker.name} keys`}</p>
            <p className="mt-1 text-xs text-brand-navy/55">
              Encrypted before they&rsquo;re stored.{" "}
              {method === "totp"
                ? `Saving connects you for today straight away — no approval needed.`
                : method === "phone"
                  ? `After saving, tap Approve in the ${broker.name} app or on WhatsApp.`
                  : broker.flow === "approval"
                    ? `Approve the key on ${broker.name} first — then saving connects you for today.`
                    : `After saving, you’ll log in on ${broker.name}’s own page.`}
            </p>
          </div>
          {conn && conn.loginMethod === method && (
            <button type="button" aria-label="Cancel" onClick={() => setEditing(false)} className="rounded-md p-1 text-brand-navy/40 hover:bg-brand-navy/5 hover:text-brand-navy">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {view.fields.map((f) => (
            <div key={f.name}>
              <label htmlFor={`${broker.id}-${f.name}`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                {f.label}
              </label>
              <input
                id={`${broker.id}-${f.name}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
              {f.help && <p className="mt-1 text-[11px] text-brand-navy/45">{f.help}</p>}
            </div>
          ))}
        </div>
        {formError && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-brand-sell">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {formError}
          </p>
        )}
        <button type="submit" disabled={pending || disabled} className={`${btn} mt-5 w-full bg-brand-primary text-white hover:bg-brand-primary-light`}>
          <LogIn size={15} /> {pending ? `Checking with ${broker.name}…` : method === "phone" ? "Save & send approval" : instant ? `Save & connect ${broker.name}` : `Save & log in to ${broker.name}`}
        </button>
        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-brand-navy/45">
          <Lock size={12} className="mt-0.5 shrink-0" /> Never paste your broker password or PIN anywhere on MyAlgoAgent — you only enter those on {broker.name}&rsquo;s own login page.
        </p>
      </form>
      {failure && <BrokerFailureCard compact brokerId={broker.id} brokerName={broker.name} failure={failure} onRetry={() => run(() => saveBrokerKeys(broker.id, values, method), { redirects: true })} onReplaceKeys={() => setFailure(null)} retrying={pending} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-navy/50">{label}</dt>
      <dd className="text-right font-medium text-brand-navy">{children}</dd>
    </div>
  );
}
