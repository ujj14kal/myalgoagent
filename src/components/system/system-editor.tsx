"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { CandleInterval } from "@/lib/market-data";
import { isIntraday } from "@/lib/market-data/timeframes";
import InstrumentCombobox from "@/components/instrument-combobox";
import PositionSizingFields from "@/components/position-sizing-fields";
import RiskManagementFields from "@/components/risk-management-fields";
import RiskOptionsFields from "@/components/risk-options-fields";
import StagedTargetsFields, { rowsToTargets, targetsToRows, type TargetRow } from "@/components/staged-targets-fields";
import EntryPlanFields, { planToState, stateToPlan, type PlanState } from "@/components/entry-plan-fields";
import { checkWorkspace, publishWorkspace, saveWorkspaceDraft, type WorkspaceCheck } from "@/lib/workspace-actions";
import { CONFLICT_RULES, type ConflictRule, type OppositeAction, type SystemIssue, type TradingSystemDefinition } from "@/lib/system/types";
import { friendlyError } from "@/lib/friendly-error";

// The Trading System Builder: every trading decision, and only those. It picks concepts (the setups) and decides the
// instrument, timeframes, sessions, capital, sizing, leverage, risk, exits, conflicts, what happens to an open
// position when the other side's setup appears, and how orders are placed. The concepts' logic is edited elsewhere.

export type ConceptChoice = { id: string; name: string; classification: "BULLISH" | "BEARISH"; text: string };
type Instrument = { id: string; symbol: string; name: string };

const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40";
const numberCls = "w-24 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
const selectCls = "rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
const pill = (on: boolean) => `rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"}`;

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d", "1wk"];
const TF_LABEL: Record<string, string> = { "60m": "1H", "4h": "4H", "1d": "1D", "1wk": "1W" };
const ASSET_CLASSES = [
  { key: "STOCK", label: "Stocks & indices", ready: true },
  { key: "FUTURES", label: "Futures", ready: false },
  { key: "OPTIONS", label: "Options", ready: false },
  { key: "FOREX", label: "Forex", ready: false },
  { key: "CRYPTO", label: "Crypto", ready: false },
];
const CONFLICT_TEXT: Record<ConflictRule, string> = {
  BULLISH: "Bullish takes priority",
  BEARISH: "Bearish takes priority",
  FIRST: "First signal wins",
  HIGHER_TIMEFRAME: "Concept on the longer chart wins",
  CONFIDENCE: "Stronger confidence wins",
  IGNORE: "Ignore both",
  WAIT: "Wait for confirmation",
};
const CONFLICT_HELP: Record<ConflictRule, string> = {
  BULLISH: "Go long.",
  BEARISH: "Go short (intraday only).",
  FIRST: "Take the side whose setup became valid first; a tie is ignored.",
  HIGHER_TIMEFRAME: "Take the side whose concept uses a block on a longer chart (e.g. an hourly trend block); a tie is ignored.",
  CONFIDENCE: "Take the side with more of its optional blocks present; a tie is ignored.",
  IGNORE: "Open nothing while both are valid.",
  WAIT: "Open nothing until one side has stayed valid on its own for the candles below.",
};
const OPPOSITE_TEXT: Record<OppositeAction, string> = { IGNORE: "Ignore it", EXIT: "Exit the position", REVERSE: "Exit and reverse" };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

function Section({ step, title, subtitle, children }: { step: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">{step}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy">{title}</p>
          {subtitle && <p className="text-xs text-brand-navy/50">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Issues({ title, tone, items }: { title: string; tone: "error" | "warn"; items: SystemIssue[] }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-xl p-3 text-sm ${tone === "error" ? "bg-brand-sell/[0.07] text-brand-sell" : "bg-brand-gold/10 text-brand-navy/75"}`}>
      <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> {title}</p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {items.map((it, i) => (
          <li key={i}>
            {it.where && <span className="font-semibold">{it.where}: </span>}
            {it.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Windows({ title, hint, list, onChange }: { title: string; hint: string; list: { startMinute: number; endMinute: number }[]; onChange: (l: { startMinute: number; endMinute: number }[]) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-brand-navy">{title}</p>
      <p className="text-[11px] text-brand-navy/45">{hint}</p>
      <div className="mt-2 space-y-1.5">
        {list.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
            <input type="time" aria-label="From" value={hhmm(w.startMinute)} onChange={(e) => e.target.value && onChange(list.map((x, j) => (j === i ? { ...x, startMinute: toMin(e.target.value) } : x)))} className="rounded-lg border border-brand-navy/15 px-2 py-1 text-sm" />
            to
            <input type="time" aria-label="To" value={hhmm(w.endMinute)} onChange={(e) => e.target.value && onChange(list.map((x, j) => (j === i ? { ...x, endMinute: toMin(e.target.value) } : x)))} className="rounded-lg border border-brand-navy/15 px-2 py-1 text-sm" />
            <button type="button" aria-label="Remove window" onClick={() => onChange(list.filter((_, j) => j !== i))} className="rounded-full p-1 text-brand-navy/40 hover:text-brand-sell"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button type="button" disabled={list.length >= 8} onClick={() => onChange([...list, { startMinute: 9 * 60 + 15, endMinute: 10 * 60 }])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary disabled:opacity-40"><Plus size={12} /> Add a window</button>
    </div>
  );
}

export default function SystemEditor({
  id,
  initialName,
  initialDescription,
  initialDraft,
  latestVersion,
  archived,
  concepts,
  instruments,
}: {
  id: string;
  initialName: string;
  initialDescription: string;
  initialDraft: TradingSystemDefinition;
  latestVersion: number;
  archived: boolean;
  concepts: ConceptChoice[];
  instruments: Instrument[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [def, setDef] = useState<TradingSystemDefinition>(initialDraft);
  const [plan, setPlan] = useState<PlanState>(() => planToState(initialDraft.entryPlan));
  const [targetRows, setTargetRows] = useState<TargetRow[]>(() => targetsToRows(initialDraft.targets));
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [check, setCheck] = useState<WorkspaceCheck | null>(null);
  const [busy, start] = useTransition();

  const change = (patch: Partial<TradingSystemDefinition>) => {
    setDef((d) => ({ ...d, ...patch }));
    setDirty(true);
    setCheck(null);
  };
  const intraday = isIntraday(def.timeframes.primary as CandleInterval);
  const canShort = def.productType === "INTRADAY";
  const chosen = new Set(def.concepts.map((c) => c.conceptId));
  const available = concepts.filter((c) => !chosen.has(c.id));
  const planned = stateToPlan(plan);
  const current = (): TradingSystemDefinition => ({ ...def, entryPlan: planned.plan ?? null, targets: targetRows.length ? rowsToTargets(targetRows) : [] });
  const setTf = (patch: Partial<TradingSystemDefinition["timeframes"]>) => {
    const timeframes = { ...def.timeframes, ...patch };
    const intra = isIntraday(timeframes.primary as CandleInterval);
    change({ timeframes, ...(patch.primary ? { productType: intra ? def.productType : "DELIVERY" } : {}) });
  };
  const setRole = (conceptId: string, role: "ENTRY" | "EXIT") => change({ concepts: def.concepts.map((x) => (x.conceptId === conceptId ? { ...x, role: role === "EXIT" ? "EXIT" : undefined } : x)) });

  function save(then?: () => void) {
    if (planned.error) return setMessage({ tone: "error", text: planned.error });
    start(async () => {
      const r = await saveWorkspaceDraft(id, { name, description, draft: current() });
      if ("error" in r) return setMessage({ tone: "error", text: r.error === "DUPLICATE_NAME" ? `You already have a trading system called "${name.trim()}".` : friendlyError(r.error, "Couldn't save.") });
      setDirty(false);
      setMessage({ tone: "ok", text: "Draft saved." });
      then?.();
    });
  }

  function runCheck() {
    if (planned.error) return setMessage({ tone: "error", text: planned.error });
    start(async () => {
      const r = await checkWorkspace(current());
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      setCheck(r);
      setMessage(r.errors.length ? { tone: "error", text: `${r.errors.length} thing${r.errors.length === 1 ? "" : "s"} to fix before this can be published.` } : { tone: "ok", text: "Everything checks out. You can publish this version." });
    });
  }

  function publish() {
    if (planned.error) return setMessage({ tone: "error", text: planned.error });
    start(async () => {
      const saved = await saveWorkspaceDraft(id, { name, description, draft: current() });
      if ("error" in saved) return setMessage({ tone: "error", text: saved.error === "DUPLICATE_NAME" ? "You already have a trading system with that name." : saved.error });
      setDirty(false);
      const r = await publishWorkspace(id, note);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      if (!r.ok) {
        setCheck({ errors: r.errors, warnings: [], concepts: [] });
        return setMessage({ tone: "error", text: "This can't be published yet. Fix the items below." });
      }
      setNote("");
      setMessage({ tone: "ok", text: `Version ${r.version} published. Backtest it from its strategy page.` });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sys-name">Trading system name</label>
            <input id="sys-name" type="text" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
          <div>
            <label className={label} htmlFor="sys-desc">Notes (optional)</label>
            <input id="sys-desc" type="text" value={description} maxLength={500} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
        </div>
        {archived && <p className="mt-3 text-xs font-medium text-brand-sell">This trading system is archived. Reactivate it to publish new versions.</p>}
      </section>

      <Section step={1} title="Concepts" subtitle="Which concepts are active. A concept either opens positions or only closes the opposite side's (an exit rule); its logic is edited in the Concept Builder">
        {def.concepts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-brand-navy/20 px-3 py-4 text-center text-xs text-brand-navy/45">No concepts yet. Add a bullish one to open longs and a bearish one to open shorts (or close longs).</p>
        ) : (
          <ul className="space-y-2">
            {def.concepts.map((ref) => {
              const c = concepts.find((x) => x.id === ref.conceptId);
              return (
                <li key={ref.conceptId} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${ref.enabled ? "bg-brand-bg" : "bg-brand-bg/50 opacity-60"}`}>
                  {c?.classification === "BEARISH" ? <TrendingDown size={16} className="shrink-0 text-brand-sell" /> : <TrendingUp size={16} className="shrink-0 text-brand-buy" />}
                  <span className="min-w-0 flex-1">
                    {c ? <Link href={`/app/workspaces/concepts/${c.id}`} className="block truncate font-medium text-brand-navy hover:underline">{c.name}</Link> : <span className="block font-medium text-brand-sell">(deleted concept)</span>}
                    {c && <span className="block truncate text-xs text-brand-navy/45" title={c.text}>{c.classification === "BEARISH" ? "Bearish" : "Bullish"} · {c.text}</span>}
                  </span>
                  <select value={ref.role === "EXIT" ? "EXIT" : "ENTRY"} onChange={(e) => setRole(ref.conceptId, e.target.value as "ENTRY" | "EXIT")} aria-label="What this concept does" className="rounded-lg border border-brand-navy/15 bg-white px-2 py-1 text-xs outline-none focus:border-brand-primary">
                    <option value="ENTRY">Opens positions</option>
                    <option value="EXIT">Only closes {c?.classification === "BEARISH" ? "longs" : "shorts"}</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-brand-navy/60">
                    <input type="checkbox" checked={ref.enabled} onChange={(e) => change({ concepts: def.concepts.map((x) => (x.conceptId === ref.conceptId ? { ...x, enabled: e.target.checked } : x)) })} /> on
                  </label>
                  <button type="button" aria-label="Remove concept" onClick={() => change({ concepts: def.concepts.filter((x) => x.conceptId !== ref.conceptId) })} className="rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell"><Trash2 size={14} /></button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value="" aria-label="Add a concept" disabled={available.length === 0} onChange={(e) => e.target.value && change({ concepts: [...def.concepts, { conceptId: e.target.value, enabled: true }] })} className="rounded-lg border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary outline-none disabled:opacity-40">
            <option value="">+ Add a concept…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.classification === "BEARISH" ? "▼" : "▲"} {c.name}</option>
            ))}
          </select>
          {concepts.length === 0 && <Link href="/app/workspaces/concepts/new" className="text-xs font-semibold text-brand-primary hover:underline">Create your first concept →</Link>}
        </div>
      </Section>

      <Section step={2} title="Instrument" subtitle="What the system trades">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Asset class">
          {ASSET_CLASSES.map((a) => (
            <button key={a.key} type="button" role="radio" aria-checked={a.key === "STOCK"} disabled={!a.ready} title={a.ready ? undefined : "Not available for trading systems yet"} className={pill(a.key === "STOCK")}>
              {a.label}
              {!a.ready && " · soon"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-brand-navy/40">NSE stocks and indices today. Futures, options, forex and crypto will get their own settings (lot size, expiry, contract) when they arrive; options strategies live in the Options Lab for now.</p>
        <div className="mt-3 max-w-md">
          <InstrumentCombobox options={instruments} value={def.instrumentId} onChange={(v) => change({ instrumentId: v })} />
        </div>
      </Section>

      <Section step={3} title="Timeframe & product" subtitle="The chart the system trades on, and how positions are held">
        <div>
          <label className={label}>Trades on</label>
          <select value={def.timeframes.primary} onChange={(e) => setTf({ primary: e.target.value })} className={selectCls} aria-label="Timeframe">
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{TF_LABEL[t] ?? t}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-brand-navy/40">Signals are read at each candle&rsquo;s close on this chart. A block that lives on another chart (an hourly trend, say) names it in the Block Builder.</p>
        </div>
        <div className="mt-4">
          <label className={label}>Product</label>
          <div className="flex flex-wrap gap-1.5">
            {(["INTRADAY", "DELIVERY"] as const).map((p) => (
              <button key={p} type="button" disabled={p === "INTRADAY" && !intraday} onClick={() => change({ productType: p, ...(p === "DELIVERY" ? { riskOptions: { ...def.riskOptions, leverage: 1, reference: "PRICE" as const } } : {}) })} className={pill(def.productType === p)}>
                {p === "INTRADAY" ? "Intraday (long & short)" : "Delivery (long only)"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-brand-navy/40">{canShort ? "Bullish concepts open longs, bearish ones open shorts; everything is squared off by the end of the day." : "Positions are held overnight and can only be long: bearish concepts can close a long but never open a short."}</p>
        </div>
      </Section>

      <Section step={4} title="Sessions" subtitle="When the system may open positions (IST)">
        {intraday ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs text-brand-navy/60">
              No new entries after
              <input type="time" value={def.sessions.noEntryAfterMinute != null ? hhmm(def.sessions.noEntryAfterMinute) : ""} onChange={(e) => change({ sessions: { ...def.sessions, noEntryAfterMinute: e.target.value ? toMin(e.target.value) : null } })} className="mt-1 block rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm" />
            </label>
            {def.productType === "INTRADAY" && (
              <label className="text-xs text-brand-navy/60">
                Square off at
                <input type="time" value={def.sessions.squareOffMinute != null ? hhmm(def.sessions.squareOffMinute) : ""} onChange={(e) => change({ sessions: { ...def.sessions, squareOffMinute: e.target.value ? toMin(e.target.value) : null } })} className="mt-1 block rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm" />
              </label>
            )}
            <Windows title="Trading windows" hint="Only open positions inside these. None = any time." list={def.sessions.entryWindows} onChange={(l) => change({ sessions: { ...def.sessions, entryWindows: l } })} />
            <Windows title="No-trade periods" hint="Never open positions inside these (e.g. the first 15 minutes, lunch)." list={def.sessions.noTradeWindows} onChange={(l) => change({ sessions: { ...def.sessions, noTradeWindows: l } })} />
          </div>
        ) : (
          <p className="text-xs text-brand-navy/50">Daily and weekly systems act once per candle, so time-of-day sessions don&rsquo;t apply. Choose an intraday primary timeframe to use them.</p>
        )}
      </Section>

      <Section step={5} title="Capital & position sizing" subtitle="What the system trades with, and how big each position is">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-brand-navy/60">
            <span className={label}>Capital for this system (₹)</span>
            <input type="number" min={1000} step={1000} value={def.capital.total} onChange={(e) => change({ capital: { ...def.capital, total: Number(e.target.value) || 0 } })} className={`${numberCls} w-36`} />
            <span className="mt-1 block text-[11px] text-brand-navy/45">Backtests and forward tests start here. Going live, you set the capital the broker account gives it.</span>
          </label>
          <label className="text-xs text-brand-navy/60">
            <span className={label}>Most one position may use (%)</span>
            <input type="number" min={1} max={100} value={def.capital.maxUtilizationPercent} onChange={(e) => change({ capital: { ...def.capital, maxUtilizationPercent: Number(e.target.value) || 0 } })} className={numberCls} />
            <span className="mt-1 block text-[11px] text-brand-navy/45">Of the capital × leverage (the buying power). 100 = no cap.</span>
          </label>
        </div>
        <div className="mt-5">
          <PositionSizingFields mode={def.positionSizingMode} value={def.positionSizingValue} onModeChange={(m) => change({ positionSizingMode: m })} onValueChange={(v) => change({ positionSizingValue: v })} />
          {def.positionSizingMode === "RISK_PERCENT" && !def.stopLoss.enabled && <p className="mt-2 text-xs font-medium text-brand-sell">Sizing by risk needs a stop-loss. Turn it on under Risk management.</p>}
        </div>
        <label className="mt-4 flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
          <span className="font-semibold text-brand-navy">Entries per position</span>
          <input type="number" min={1} max={10} value={def.maxPyramidEntries} onChange={(e) => change({ maxPyramidEntries: Math.max(1, Math.min(10, Math.floor(Number(e.target.value)) || 1)) })} className={`${numberCls} w-16`} />
          <span>— above 1, a new setup of the same side adds to the open position.</span>
        </label>
        <div className="mt-4">
          <EntryPlanFields state={plan} onChange={(p) => { setPlan(p); setDirty(true); setCheck(null); }} direction="LONG" pyramiding={def.maxPyramidEntries > 1} />
        </div>
      </Section>

      <Section step={6} title="Risk management" subtitle="Stop-loss, take-profit, R:R, trailing, break-even, leverage and the system's loss limits">
        <RiskManagementFields stopLoss={def.stopLoss} target={def.target} trailingSl={def.trailingSl} onStopLossChange={(l) => change({ stopLoss: l })} onTargetChange={(l) => change({ target: l })} onTrailingSlChange={(l) => change({ trailingSl: l })} />
        <StagedTargetsFields rows={targetRows} direction="LONG" singleTargetOn={def.target.enabled} onChange={(rows) => { setTargetRows(rows); setDirty(true); setCheck(null); if (rows.length > 0 && def.target.enabled) change({ target: { ...def.target, enabled: false } }); }} />
        <RiskOptionsFields value={def.riskOptions} onChange={(o) => change({ riskOptions: o })} productType={def.productType} stopLoss={def.stopLoss} target={def.target} entryPrice={null} />
        <p className="mt-2 text-xs text-brand-navy/45">Examples above show a long; a short is the mirror image (stop above the entry, targets below).</p>
      </Section>

      <Section step={7} title="When bullish and bearish setups conflict" subtitle="Both sides valid on the same candle while flat">
        <div className="grid gap-2 sm:grid-cols-2">
          {CONFLICT_RULES.map((r) => (
            <label key={r} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${def.conflict.rule === r ? "border-brand-primary bg-brand-primary/5" : "border-brand-navy/10"}`}>
              <input type="radio" name="conflict" checked={def.conflict.rule === r} onChange={() => change({ conflict: { ...def.conflict, rule: r } })} className="mt-0.5" />
              <span>
                <span className="block font-semibold text-brand-navy">{CONFLICT_TEXT[r]}</span>
                <span className="block text-xs text-brand-navy/50">{CONFLICT_HELP[r]}</span>
              </span>
            </label>
          ))}
        </div>
        {def.conflict.rule === "WAIT" && (
          <label className="mt-3 flex items-center gap-2 text-xs text-brand-navy/60">
            Wait until one side holds alone for
            <input type="number" min={1} max={50} value={def.conflict.confirmBars} onChange={(e) => change({ conflict: { ...def.conflict, confirmBars: Math.max(1, Math.floor(Number(e.target.value)) || 1) } })} className={`${numberCls} w-16`} />
            candles
          </label>
        )}
      </Section>

      <Section step={8} title="Position management" subtitle="What an open position does when the other side's setup becomes valid">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["whenLong", "whenShort"] as const).map((k) => (
            <div key={k}>
              <span className={label}>{k === "whenLong" ? "Long + bearish setup" : "Short + bullish setup"}</span>
              <div className="flex flex-wrap gap-1.5">
                {(["IGNORE", "EXIT", "REVERSE"] as const).map((a) => (
                  <button key={a} type="button" disabled={k === "whenShort" && !canShort} onClick={() => change({ opposite: { ...def.opposite, [k]: a } })} className={pill(def.opposite[k] === a)}>
                    {a === "REVERSE" ? (k === "whenLong" ? "Exit and go short" : "Exit and go long") : OPPOSITE_TEXT[a]}
                  </button>
                ))}
              </div>
              {k === "whenLong" && !canShort && def.opposite.whenLong === "REVERSE" && <p className="mt-1 text-[11px] text-brand-navy/45">Delivery can&rsquo;t go short, so this only exits.</p>}
            </div>
          ))}
        </div>
        <label className="mt-4 flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
          <span className="font-semibold text-brand-navy">Wait for confirmation:</span> act only once the opposite setup has held for
          <input type="number" min={0} max={50} value={def.opposite.confirmBars} onChange={(e) => change({ opposite: { ...def.opposite, confirmBars: Math.max(0, Math.floor(Number(e.target.value)) || 0) } })} className={`${numberCls} w-16`} />
          more candle{def.opposite.confirmBars === 1 ? "" : "s"} (0 = at once)
        </label>
        <p className="mt-3 rounded-lg bg-brand-bg px-3 py-2 text-xs text-brand-navy/60">Flat: a valid setup opens its side (the conflict rule decides when both are valid). In a position: a setup of the same side adds to it when you allow several entries per position; stops, targets and square-off close it as usual. Every decision is made at a candle&rsquo;s close and filled at the next candle&rsquo;s open.</p>
      </Section>

      <Section step={9} title="Execution" subtitle="How entries are placed">
        <div className="flex flex-wrap items-center gap-2">
          {(["MARKET", "LIMIT"] as const).map((o) => (
            <button key={o} type="button" onClick={() => change({ orderType: o, ...(o === "LIMIT" && !def.limitMode ? { limitMode: "PERCENT" as const, limitValue: 0.2 } : {}) })} className={pill(def.orderType === o)}>
              {o === "MARKET" ? "Market order" : "Limit order"}
            </button>
          ))}
          {def.orderType === "LIMIT" && (
            <>
              <select value={def.limitMode ?? "PERCENT"} onChange={(e) => change({ limitMode: e.target.value as "PERCENT" | "PRICE" })} className={selectCls} aria-label="Limit price">
                <option value="PERCENT">% from the signal price (below for a buy, above for a short)</option>
                <option value="PRICE">at a fixed price</option>
              </select>
              <input type="number" min={0} step="0.05" value={def.limitValue ?? 0} onChange={(e) => change({ limitValue: Number(e.target.value) })} className={numberCls} aria-label="Limit value" />
            </>
          )}
        </div>
        <p className="mt-1.5 text-xs text-brand-navy/40">Exits (stops, targets, opposite setups, square-off) always go out at market.</p>
      </Section>

      <Section step={10} title="Check and publish" subtitle="Publishing freezes this system — with an exact copy of its concepts and blocks — as a numbered version you can backtest, forward test and take live">
        <div className="space-y-3">
          {check && (
            <>
              <Issues title="Fix these before publishing" tone="error" items={check.errors} />
              <Issues title="Worth a look" tone="warn" items={check.warnings} />
              {check.concepts.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-brand-bg p-3 text-xs text-brand-navy/70">
                  {check.concepts.map((c) => (
                    <li key={c.id}>
                      <span className={`font-semibold ${c.classification === "BEARISH" ? "text-brand-sell" : "text-brand-buy"}`}>{c.name}: </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {message && (
            <p className={`flex items-center gap-1.5 text-sm font-medium ${message.tone === "ok" ? "text-brand-buy" : "text-brand-sell"}`} role="status">
              {message.tone === "ok" && <CheckCircle2 size={15} />} {message.text}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" disabled={busy} onClick={() => save()} className="rounded-full border border-brand-primary px-5 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50">
              {busy ? "Working…" : dirty ? "Save draft" : "Saved"}
            </button>
            <button type="button" disabled={busy} onClick={runCheck} className="rounded-full border border-brand-navy/25 px-5 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50">Check the system</button>
            <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={`Note for version ${latestVersion + 1} (optional)`} aria-label="Version note" className="min-w-[12rem] flex-1 rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary" />
            <button type="button" disabled={busy || archived} onClick={publish} className="rounded-full bg-brand-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Publish version {latestVersion + 1}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
