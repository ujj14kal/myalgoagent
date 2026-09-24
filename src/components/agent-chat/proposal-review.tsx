"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  ArrowRight,
  BookmarkMinus,
  BookmarkPlus,
  Check,
  FlaskConical,
  Layers,
  OctagonX,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import BodyPortal from "@/components/ui/body-portal";
import Agent2D from "@/components/robot/agent-2d";
import { PROPOSAL_TITLES, toStrategyInput, type AgentProposal, type ProposalStatus } from "@/lib/ai/proposals";
import { listInstrumentsForReview, setProposalStatus } from "@/lib/agent-chat-actions";
import { createStrategy, archiveStrategyAction } from "@/lib/strategy-actions";
import { runBacktestAction } from "@/lib/backtest-actions";
import { setPaperSessionStatus, startPaperSession, syncPaperSessionAction } from "@/lib/paper-actions";
import { toggleKillSwitch, updateRiskSettings } from "@/lib/risk-actions";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist-actions";

const ICONS: Record<AgentProposal["kind"], React.ReactNode> = {
  strategy: <Layers size={16} />,
  backtest: <FlaskConical size={16} />,
  paper_session: <PlayCircle size={16} />,
  risk_limits: <ShieldCheck size={16} />,
  kill_switch: <OctagonX size={16} />,
  watchlist_add: <BookmarkPlus size={16} />,
  watchlist_remove: <BookmarkMinus size={16} />,
  paper_control: <RefreshCw size={16} />,
  strategy_archive: <Archive size={16} />,
};

const RANGE_LABEL = { "3mo": "3 months", "6mo": "6 months", "1y": "1 year", "5y": "5 years" } as const;
const PAPER_VERB = { sync: "Sync now", pause: "Pause", resume: "Resume", stop: "Stop" } as const;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** One line for the chat card. */
export function proposalSummary(p: AgentProposal): string {
  switch (p.kind) {
    case "strategy":
      return `${p.draft.name} · ${p.draft.direction === "LONG" ? "Long" : "Short"}${p.draft.instrumentSymbol ? ` · ${p.draft.instrumentSymbol}` : ""}`;
    case "backtest":
      return `${p.draft.strategyName} · ${RANGE_LABEL[p.draft.range]} · ${inr(p.draft.startingCapital)}`;
    case "paper_session":
      return `${p.draft.strategyName} · ${inr(p.draft.startingCapital)} virtual${p.draft.alertOnly ? " · alerts only" : ""}`;
    case "risk_limits":
      return `Max loss ${p.draft.maxLossPercent == null ? "off" : `${p.draft.maxLossPercent}%`} · Max losing streak ${p.draft.maxConsecutiveLosses ?? "off"}`;
    case "kill_switch":
      return p.draft.enabled ? "Halt all new positions" : "Resume trading";
    case "watchlist_add":
    case "watchlist_remove":
      return p.draft.instrumentSymbol;
    case "paper_control":
      return `${PAPER_VERB[p.draft.action]} · ${p.draft.strategyName} (${p.draft.instrumentSymbol})`;
    case "strategy_archive":
      return p.draft.strategyName;
  }
}

function confirmLabel(p: AgentProposal): string {
  switch (p.kind) {
    case "strategy":
      return "Create strategy";
    case "backtest":
      return "Run backtest";
    case "paper_session":
      return "Start session";
    case "risk_limits":
      return "Save limits";
    case "kill_switch":
      return p.draft.enabled ? "Halt trading" : "Resume trading";
    case "watchlist_add":
      return "Add to watchlist";
    case "watchlist_remove":
      return "Remove";
    case "paper_control":
      return PAPER_VERB[p.draft.action];
    case "strategy_archive":
      return "Archive";
  }
}

/** Turns the builder's collected-issues JSON (or a plain message) into readable text. */
function readableError(err: string): string {
  if (err === "DUPLICATE_NAME") return "You already have a strategy with this name — give it a different name.";
  try {
    const issues = JSON.parse(err) as { message?: string }[];
    if (Array.isArray(issues)) return issues.map((i) => i.message).filter(Boolean).join(" ");
  } catch {
    /* not JSON */
  }
  return err;
}

/**
 * Runs a confirmed proposal through the platform's own server action. Actions
 * that finish on a page of their own (create strategy, run backtest, start a
 * session) redirect there themselves; the rest navigate here.
 */
async function execute(p: AgentProposal, instrumentId: string | null, go: (path: string) => void): Promise<string | null> {
  switch (p.kind) {
    case "strategy": {
      if (!instrumentId) return "Pick an instrument for this strategy.";
      const res = await createStrategy(toStrategyInput(p.draft, instrumentId));
      return res?.error ? readableError(res.error) : null;
    }
    case "backtest": {
      const { strategyId, startingCapital, brokeragePercent, slippagePercent, range } = p.draft;
      const res = await runBacktestAction({ strategyId, startingCapital, brokeragePercent, slippagePercent, range });
      return res?.error ?? null;
    }
    case "paper_session": {
      const { strategyId, startingCapital, brokeragePercent, slippagePercent, alertOnly } = p.draft;
      const res = await startPaperSession({ strategyId, startingCapital, brokeragePercent, slippagePercent, alertOnly });
      return res?.error ?? null;
    }
    case "risk_limits": {
      const res = await updateRiskSettings(p.draft);
      if (!res.ok) return res.error;
      go("/app/risk-controls");
      return null;
    }
    case "kill_switch": {
      const res = await toggleKillSwitch(p.draft.enabled);
      if (!res.ok) return res.error;
      go("/app/risk-controls");
      return null;
    }
    case "watchlist_add": {
      const res = await addToWatchlist(p.draft.instrumentId);
      if (!res.ok) return res.error;
      go("/app/watchlist");
      return null;
    }
    case "watchlist_remove": {
      const res = await removeFromWatchlist(p.draft.watchlistItemId);
      if (!res.ok) return res.error;
      go("/app/watchlist");
      return null;
    }
    case "paper_control": {
      const { sessionId, action } = p.draft;
      const res =
        action === "sync"
          ? await syncPaperSessionAction(sessionId)
          : await setPaperSessionStatus(sessionId, action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "STOPPED");
      if (res?.error) return res.error;
      go(`/app/paper-trading/${sessionId}`);
      return null;
    }
    case "strategy_archive": {
      await archiveStrategyAction(p.draft.strategyId);
      go("/app/strategies");
      return null;
    }
  }
}

// ---------- the chat card ----------

export function ProposalCard({
  proposal,
  onReview,
}: {
  proposal: AgentProposal;
  onReview: () => void;
}) {
  const status: Record<ProposalStatus, { label: string; cls: string }> = {
    pending: { label: "To review", cls: "bg-brand-gold/15 text-[#8a7437]" },
    confirmed: { label: "Done", cls: "bg-brand-buy/10 text-brand-buy" },
    rejected: { label: "Rejected", cls: "bg-brand-navy/5 text-brand-navy/50" },
  };
  const s = status[proposal.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: 0.08 }}
      className="flex items-center gap-3 rounded-xl bg-brand-bg p-3 ring-1 ring-brand-primary/15"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">{ICONS[proposal.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="whitespace-nowrap text-[13px] font-semibold text-brand-navy">{PROPOSAL_TITLES[proposal.kind]}</span>
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
        </span>
        <span className="block truncate text-xs text-brand-navy/60">{proposalSummary(proposal)}</span>
      </span>
      {proposal.status === "pending" && (
        <button
          type="button"
          onClick={onReview}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light"
        >
          Review <ArrowRight size={12} />
        </button>
      )}
    </motion.div>
  );
}

// ---------- the review modal ----------

const inputCls =
  "w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none transition-shadow focus:border-brand-primary focus:shadow-[0_0_0_3px_rgba(71,24,152,0.1)]";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-brand-navy/45";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, step = "any", placeholder }: { value: number | null; onChange: (v: number | null) => void; step?: string; placeholder?: string }) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={inputCls}
    />
  );
}

type Leg = { enabled: boolean; unit: "PERCENT" | "POINTS" | "ATR_MULTIPLE"; value: number };

function LegRow({ label, leg, onChange }: { label: string; leg: Leg; onChange: (l: Leg) => void }) {
  return (
    <div className="grid grid-cols-[1fr_88px_110px] items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-brand-navy">
        <input type="checkbox" checked={leg.enabled} onChange={(e) => onChange({ ...leg, enabled: e.target.checked, value: leg.value || 2 })} className="accent-brand-primary" />
        {label}
      </label>
      <input
        type="number"
        step="any"
        disabled={!leg.enabled}
        value={leg.enabled ? leg.value : ""}
        onChange={(e) => onChange({ ...leg, value: Number(e.target.value) })}
        className={`${inputCls} py-1.5 disabled:bg-brand-bg disabled:text-brand-navy/30`}
      />
      <select disabled={!leg.enabled} value={leg.unit} onChange={(e) => onChange({ ...leg, unit: e.target.value as Leg["unit"] })} className={`${inputCls} py-1.5 disabled:bg-brand-bg disabled:text-brand-navy/30`}>
        <option value="PERCENT">%</option>
        <option value="POINTS">points</option>
        <option value="ATR_MULTIPLE">× ATR</option>
      </select>
    </div>
  );
}

function StrategyFields({
  draft,
  onChange,
  instrumentId,
  onInstrument,
}: {
  draft: Extract<AgentProposal, { kind: "strategy" }>["draft"];
  onChange: (d: Extract<AgentProposal, { kind: "strategy" }>["draft"]) => void;
  instrumentId: string | null;
  onInstrument: (id: string) => void;
}) {
  const [instruments, setInstruments] = useState<{ id: string; symbol: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    listInstrumentsForReview().then((rows) => !cancelled && setInstruments(rows));
    return () => {
      cancelled = true;
    };
  }, []);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Instrument">
          <select value={instrumentId ?? ""} onChange={(e) => onInstrument(e.target.value)} className={`${inputCls} ${!instrumentId ? "border-brand-gold ring-2 ring-brand-gold/20" : ""}`}>
            <option value="" disabled>
              Choose an instrument…
            </option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.symbol} — {i.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Direction">
        <div className="inline-flex rounded-lg bg-brand-bg p-1 ring-1 ring-black/5">
          {(["LONG", "SHORT"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set("direction", d)}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${draft.direction === d ? "bg-white text-brand-primary shadow-sm" : "text-brand-navy/50"}`}
            >
              {d === "LONG" ? "Long" : "Short"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Entry — when to open a position">
        <textarea value={draft.entrySource} onChange={(e) => set("entrySource", e.target.value)} rows={2} className={`${inputCls} resize-none font-mono text-[13px]`} />
      </Field>
      <Field label="Exit — when to close it">
        <textarea value={draft.exitSource} onChange={(e) => set("exitSource", e.target.value)} rows={2} className={`${inputCls} resize-none font-mono text-[13px]`} />
      </Field>
      <div>
        <span className={labelCls}>Risk rules</span>
        <div className="space-y-2 rounded-xl bg-brand-bg p-3 ring-1 ring-black/5">
          <LegRow label="Stop-loss" leg={draft.stopLoss} onChange={(l) => set("stopLoss", l)} />
          <LegRow label="Take-profit" leg={draft.target} onChange={(l) => set("target", l)} />
          <LegRow label="Trailing stop" leg={draft.trailingSl} onChange={(l) => set("trailingSl", l)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Position sizing">
          <select
            value={draft.positionSizingMode}
            onChange={(e) => onChange({ ...draft, positionSizingMode: e.target.value as typeof draft.positionSizingMode, positionSizingValue: e.target.value === "FULL_CAPITAL" ? null : draft.positionSizingValue })}
            className={inputCls}
          >
            <option value="FULL_CAPITAL">Full capital</option>
            <option value="PERCENT_OF_CAPITAL">% of capital</option>
            <option value="FIXED_CAPITAL">Fixed amount (₹)</option>
            <option value="FIXED_QUANTITY">Fixed quantity (shares)</option>
          </select>
        </Field>
        {draft.positionSizingMode !== "FULL_CAPITAL" && (
          <Field label="Value">
            <NumberInput value={draft.positionSizingValue} onChange={(v) => set("positionSizingValue", v)} />
          </Field>
        )}
      </div>
    </div>
  );
}

function CostFields({
  draft,
  onChange,
}: {
  draft: { startingCapital: number; brokeragePercent: number; slippagePercent: number };
  onChange: (patch: Partial<{ startingCapital: number; brokeragePercent: number; slippagePercent: number }>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Starting capital (₹)">
        <NumberInput value={draft.startingCapital} onChange={(v) => onChange({ startingCapital: v ?? 0 })} />
      </Field>
      <Field label="Brokerage (%)">
        <NumberInput value={draft.brokeragePercent} onChange={(v) => onChange({ brokeragePercent: v ?? 0 })} />
      </Field>
      <Field label="Slippage (%)">
        <NumberInput value={draft.slippagePercent} onChange={(v) => onChange({ slippagePercent: v ?? 0 })} />
      </Field>
    </div>
  );
}

function Statement({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-brand-bg px-4 py-3 text-sm leading-relaxed text-brand-navy/80 ring-1 ring-black/5">{children}</p>;
}

function ProposalFields({
  p,
  onChange,
  instrumentId,
  onInstrument,
}: {
  p: AgentProposal;
  onChange: (p: AgentProposal) => void;
  instrumentId: string | null;
  onInstrument: (id: string) => void;
}) {
  switch (p.kind) {
    case "strategy":
      return <StrategyFields draft={p.draft} onChange={(draft) => onChange({ ...p, draft })} instrumentId={instrumentId} onInstrument={onInstrument} />;
    case "backtest":
      return (
        <div className="space-y-4">
          <Statement>
            Backtest <strong>{p.draft.strategyName}</strong> on {p.draft.instrumentSymbol} using historical data.
          </Statement>
          <Field label="Period">
            <select value={p.draft.range} onChange={(e) => onChange({ ...p, draft: { ...p.draft, range: e.target.value as typeof p.draft.range } })} className={inputCls}>
              {Object.entries(RANGE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <CostFields draft={p.draft} onChange={(patch) => onChange({ ...p, draft: { ...p.draft, ...patch } })} />
        </div>
      );
    case "paper_session":
      return (
        <div className="space-y-4">
          <Statement>
            Run <strong>{p.draft.strategyName}</strong> on {p.draft.instrumentSymbol} forward with virtual money — no real orders.
          </Statement>
          <CostFields draft={p.draft} onChange={(patch) => onChange({ ...p, draft: { ...p.draft, ...patch } })} />
          <label className="flex items-center gap-2 text-sm text-brand-navy">
            <input type="checkbox" checked={p.draft.alertOnly} onChange={(e) => onChange({ ...p, draft: { ...p.draft, alertOnly: e.target.checked } })} className="accent-brand-primary" />
            Alerts only (notify on signals, don&rsquo;t simulate trades)
          </label>
        </div>
      );
    case "risk_limits":
      return (
        <div className="space-y-4">
          <Statement>These limits apply to all your paper sessions. Leave a field empty for no limit.</Statement>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max loss per session (%)">
              <NumberInput value={p.draft.maxLossPercent} placeholder="No limit" onChange={(v) => onChange({ ...p, draft: { ...p.draft, maxLossPercent: v } })} />
            </Field>
            <Field label="Max consecutive losses">
              <NumberInput step="1" value={p.draft.maxConsecutiveLosses} placeholder="No limit" onChange={(v) => onChange({ ...p, draft: { ...p.draft, maxConsecutiveLosses: v } })} />
            </Field>
          </div>
        </div>
      );
    case "kill_switch":
      return (
        <Statement>
          {p.draft.enabled
            ? "Turn the kill switch ON: none of your paper sessions will open a new position until you turn it off."
            : "Turn the kill switch OFF: your paper sessions can open new positions normally again."}
        </Statement>
      );
    case "watchlist_add":
      return (
        <Statement>
          Add <strong>{p.draft.instrumentSymbol}</strong> ({p.draft.instrumentName}) to your watchlist.
        </Statement>
      );
    case "watchlist_remove":
      return (
        <Statement>
          Remove <strong>{p.draft.instrumentSymbol}</strong> from your watchlist.
        </Statement>
      );
    case "paper_control":
      return (
        <Statement>
          {p.draft.action === "sync" && "Update"}
          {p.draft.action === "pause" && "Pause"}
          {p.draft.action === "resume" && "Resume"}
          {p.draft.action === "stop" && "Stop"} the paper session <strong>{p.draft.strategyName}</strong> ({p.draft.instrumentSymbol})
          {p.draft.action === "sync" && " with the latest end-of-day data"}
          {p.draft.action === "stop" && ". A stopped session can't be restarted"}.
        </Statement>
      );
    case "strategy_archive":
      return (
        <Statement>
          Archive <strong>{p.draft.strategyName}</strong>. It moves out of your active list and can be restored at any time.
        </Statement>
      );
  }
}

export function ProposalReviewModal({
  messageId,
  proposal,
  agentName,
  onClose,
  onDecided,
  onDone,
}: {
  messageId: string;
  proposal: AgentProposal;
  agentName: string;
  onClose: () => void;
  onDecided: (status: ProposalStatus) => void;
  /** Called after a confirmed action succeeds — the chat closes so the result page shows. */
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AgentProposal>(proposal);
  const [instrumentId, setInstrumentId] = useState<string | null>(proposal.kind === "strategy" ? proposal.draft.instrumentId : null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const destructive = (draft.kind === "kill_switch" && draft.draft.enabled) || (draft.kind === "paper_control" && draft.draft.action === "stop");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !isPending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);

  const reject = () => {
    startTransition(async () => {
      await setProposalStatus({ messageId, status: "rejected" }).catch(() => null);
      onDecided("rejected");
      onClose();
    });
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      // Record the decision first: several actions redirect as soon as they succeed.
      await setProposalStatus({ messageId, status: "confirmed" }).catch(() => null);
      onDecided("confirmed");
      let failure: string | null;
      try {
        failure = await execute(draft, instrumentId, (path) => router.push(path));
      } catch (err) {
        // A redirect from the server action surfaces as a thrown navigation signal — that's success.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
          failure = null;
        } else {
          failure = "That didn't go through. Please refresh the page and try again.";
        }
      }
      if (failure) {
        await setProposalStatus({ messageId, status: "pending" }).catch(() => null);
        onDecided("pending");
        setError(failure);
        return;
      }
      onDone();
    });
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Review: ${PROPOSAL_TITLES[draft.kind]}`}>
        <motion.button
          type="button"
          aria-label="Close review"
          className="absolute inset-0 bg-[#0e1b2d]/55 backdrop-blur-[3px]"
          onClick={() => !isPending && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
          className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_40px_80px_-24px_rgba(14,27,45,0.6)] sm:max-w-xl sm:rounded-3xl"
        >
          <div className="app-sidebar-bg relative flex items-center gap-3 overflow-hidden px-5 py-4 text-white">
            <span aria-hidden className="pointer-events-none absolute -right-8 -top-14 h-36 w-36 rounded-full bg-brand-primary-light/30 blur-2xl" />
            <span className="relative -my-3 shrink-0">
              <Agent2D pose={isPending ? "working" : "talk"} size={64} trackCursor={false} />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold">Prepared by {agentName}</p>
              <p className="truncate text-lg font-bold text-white">{PROPOSAL_TITLES[draft.kind]}</p>
            </div>
            <button type="button" onClick={onClose} disabled={isPending} aria-label="Close review" className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-40">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <p className="mb-4 flex items-center gap-2 text-xs text-brand-navy/55">
              <Check size={13} className="text-brand-buy" /> Everything is filled in and checked. Review it, change anything you like, then confirm.
            </p>
            <ProposalFields p={draft} onChange={setDraft} instrumentId={instrumentId} onInstrument={setInstrumentId} />
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="mt-4 overflow-hidden rounded-lg bg-brand-sell/[0.07] px-3 py-2.5 text-sm font-medium text-brand-sell">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 border-t border-black/5 bg-brand-bg/60 px-5 py-4">
            <p className="hidden flex-1 text-[11px] leading-snug text-brand-navy/45 sm:block">Nothing happens until you confirm.</p>
            <button type="button" onClick={reject} disabled={isPending} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-navy disabled:opacity-40">
              Reject
            </button>
            <motion.button
              type="button"
              onClick={confirm}
              disabled={isPending}
              whileTap={{ scale: 0.97 }}
              className={`ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(71,24,152,0.6)] disabled:opacity-60 sm:ml-0 ${
                destructive ? "bg-brand-sell hover:opacity-90" : "bg-brand-primary hover:bg-brand-primary-light"
              }`}
            >
              {isPending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Working…
                </>
              ) : (
                <>
                  <Check size={15} /> {confirmLabel(draft)}
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  );
}
