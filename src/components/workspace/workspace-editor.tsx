"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import InstrumentCombobox from "@/components/instrument-combobox";
import PositionSizingFields from "@/components/position-sizing-fields";
import RiskManagementFields from "@/components/risk-management-fields";
import StagedTargetsFields, { rowsToTargets, targetsToRows, type TargetRow } from "@/components/staged-targets-fields";
import EntryPlanFields, { planToState, stateToPlan, type PlanState } from "@/components/entry-plan-fields";
import LogicEditor, { startLogic, type MemberOption } from "@/components/workspace/logic-editor";
import { checkWorkspace, publishWorkspace, saveWorkspaceDraft, type WorkspaceCheck } from "@/lib/workspace-actions";
import { usedMembers } from "@/lib/workspace/definition";
import type { LogicNode, WorkspaceDefinition, WorkspaceIssue } from "@/lib/workspace/types";
import { STYLE_LABEL } from "@/lib/strategy/style";
import { friendlyError } from "@/lib/friendly-error";

export type StrategyChoice = { id: string; name: string; direction: "LONG" | "SHORT"; symbol: string; timeframe: string; mode: "NO_CODE" | "CODE" | "WEBHOOK" };
type Instrument = { id: string; symbol: string; name: string };

const LETTERS = "ABCDEFGHIJKLMNOPQRST";

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

const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40";
const pill = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"}`;

function Issues({ title, tone, items }: { title: string; tone: "error" | "warn"; items: WorkspaceIssue[] }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-xl p-3 text-sm ${tone === "error" ? "bg-brand-sell/[0.07] text-brand-sell" : "bg-brand-gold/10 text-brand-navy/75"}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={14} /> {title}
      </p>
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

export default function WorkspaceEditor({
  id,
  initialName,
  initialDescription,
  initialDraft,
  latestVersion,
  archived,
  strategies,
  instruments,
}: {
  id: string;
  initialName: string;
  initialDescription: string;
  initialDraft: WorkspaceDefinition;
  latestVersion: number;
  archived: boolean;
  strategies: StrategyChoice[];
  instruments: Instrument[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [def, setDef] = useState<WorkspaceDefinition>(initialDraft);
  const [plan, setPlan] = useState<PlanState>(() => planToState(initialDraft.entryPlan));
  const [targetRows, setTargetRows] = useState<TargetRow[]>(() => targetsToRows(initialDraft.targets));
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [check, setCheck] = useState<WorkspaceCheck | null>(null);
  const [busy, startTransition] = useTransition();

  const change = (patch: Partial<WorkspaceDefinition>) => {
    setDef((d) => ({ ...d, ...patch }));
    setDirty(true);
    setCheck(null);
  };
  const swingish = def.style === "SWING" || def.style === "POSITIONAL";
  const memberOptions: MemberOption[] = def.members.map((m) => {
    const s = strategies.find((x) => x.id === m.strategyId);
    return { id: m.id, name: s?.name ?? "(removed strategy)", detail: s ? `${s.symbol} · ${s.timeframe}` : "" };
  });
  const taken = new Set(def.members.map((m) => m.strategyId));
  const available = strategies.filter((s) => !taken.has(s.id) && s.mode !== "WEBHOOK");
  const stagedProblemPlan = stateToPlan(plan);
  const intraday = def.timeframe !== "1d";

  /** The plan as it will be saved: the form's plan and target rows folded into the definition. */
  function current(): WorkspaceDefinition {
    return { ...def, entryPlan: stagedProblemPlan.plan ?? null, targets: targetRows.length ? rowsToTargets(targetRows) : [] };
  }

  function chooseStyle(next: "STANDARD" | "SWING" | "POSITIONAL") {
    if (next === "STANDARD") return change({ style: null });
    change({ style: next, timeframe: "1d", productType: "DELIVERY", direction: "LONG", noEntryAfterMinute: null, squareOffMinute: null });
  }

  function save(then?: () => void) {
    if (stagedProblemPlan.error) return setMessage({ tone: "error", text: stagedProblemPlan.error });
    startTransition(async () => {
      const r = await saveWorkspaceDraft(id, { name, description, draft: current() });
      if ("error" in r) {
        setMessage({ tone: "error", text: r.error === "DUPLICATE_NAME" ? `You already have a workspace called "${name.trim()}". Choose a different name.` : friendlyError(r.error, "Couldn't save.") });
        return;
      }
      setDirty(false);
      setMessage({ tone: "ok", text: "Draft saved." });
      then?.();
    });
  }

  function runCheck() {
    if (stagedProblemPlan.error) return setMessage({ tone: "error", text: stagedProblemPlan.error });
    startTransition(async () => {
      const r = await checkWorkspace(current());
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      setCheck(r);
      setMessage(r.errors.length ? { tone: "error", text: `${r.errors.length} thing${r.errors.length === 1 ? "" : "s"} to fix before this can be published.` } : { tone: "ok", text: "Everything checks out. You can publish this version." });
    });
  }

  function publish() {
    if (stagedProblemPlan.error) return setMessage({ tone: "error", text: stagedProblemPlan.error });
    startTransition(async () => {
      const saved = await saveWorkspaceDraft(id, { name, description, draft: current() });
      if ("error" in saved) return setMessage({ tone: "error", text: saved.error === "DUPLICATE_NAME" ? "You already have a workspace with that name." : saved.error });
      setDirty(false);
      const r = await publishWorkspace(id, note);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      if (!r.ok) {
        setCheck({ errors: r.errors, warnings: [], entryText: "", exitText: "" });
        return setMessage({ tone: "error", text: "This can't be published yet. Fix the items below." });
      }
      setNote("");
      setMessage({ tone: "ok", text: `Version ${r.version} published as a strategy.` });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="ws-name">Workspace name</label>
            <input id="ws-name" type="text" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
          <div>
            <label className={label} htmlFor="ws-desc">Notes (optional)</label>
            <input id="ws-desc" type="text" value={description} maxLength={500} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" placeholder="What this plan is for" />
          </div>
        </div>
        {archived && <p className="mt-3 text-xs font-medium text-brand-sell">This workspace is archived. Reactivate it to publish new versions.</p>}
      </section>

      <Section step={1} title="Setup" subtitle="What it trades and how it is held">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Instrument</label>
            <InstrumentCombobox options={instruments} value={def.instrumentId} onChange={(v) => change({ instrumentId: v })} />
          </div>
          <div>
            <label className={label}>Direction</label>
            <div className="flex w-fit overflow-hidden rounded-full border border-brand-navy/15">
              {(["LONG", "SHORT"] as const).map((d) => (
                <button key={d} type="button" disabled={swingish && d === "SHORT"} onClick={() => change({ direction: d, ...(d === "SHORT" ? { productType: "INTRADAY" as const } : {}) })} className={`px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${def.direction === d ? (d === "LONG" ? "bg-brand-buy text-white" : "bg-brand-sell text-white") : "text-brand-navy/60 hover:bg-brand-bg"}`}>
                  {d === "LONG" ? "Buy (Long)" : "Sell (Short)"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Holding style</label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Holding style">
              {(["STANDARD", "SWING", "POSITIONAL"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={(def.style ?? "STANDARD") === s} onClick={() => chooseStyle(s)} className={pill((def.style ?? "STANDARD") === s)}>
                  {s === "STANDARD" ? "Standard" : STYLE_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-brand-navy/40">{swingish ? "Held overnight: daily candles, delivery, long only." : "Choose Swing or Positional for plans that build and leave a position over days or months."}</p>
          </div>
          <div>
            <label className={label}>Timeframe</label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Timeframe">
              {["1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d"].map((t) => (
                <button key={t} type="button" role="radio" aria-checked={def.timeframe === t} disabled={swingish && t !== "1d"} onClick={() => change({ timeframe: t, productType: t === "1d" ? "DELIVERY" : "INTRADAY" })} className={pill(def.timeframe === t)}>
                  {t === "60m" ? "1H" : t === "4h" ? "4H" : t === "1d" ? "1D" : t}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-brand-navy/40">Every strategy and rule here is checked on this candle size. Rules that name their own timeframe keep it.</p>
          </div>
        </div>
      </Section>

      <Section step={2} title="Strategies" subtitle="Reuse strategies you have already built; connect their rules below">
        {def.members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-brand-navy/20 px-3 py-4 text-center text-xs text-brand-navy/45">No strategies added yet. You can also build the whole plan from rules of your own.</p>
        ) : (
          <ul className="space-y-2">
            {def.members.map((m) => {
              const s = strategies.find((x) => x.id === m.strategyId);
              const usedHere = usedMembers(def.entry).includes(m.id) || usedMembers(def.exit).includes(m.id);
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-lg bg-brand-bg px-3 py-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">{m.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-brand-navy">{s?.name ?? "(removed strategy)"}</span>
                    {s && <span className="block text-xs text-brand-navy/45">{s.symbol} · {s.timeframe} · {s.direction === "SHORT" ? "short" : "long"}{usedHere ? "" : " · not connected yet"}</span>}
                  </span>
                  <button type="button" aria-label={`Remove strategy ${m.id}`} onClick={() => change({ members: def.members.filter((x) => x.id !== m.id), entry: prune(def.entry, m.id), exit: prune(def.exit, m.id) })} className="rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell">
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <select
            value=""
            aria-label="Add a strategy"
            disabled={available.length === 0 || def.members.length >= LETTERS.length}
            onChange={(e) => {
              if (!e.target.value) return;
              const free = [...LETTERS].find((l) => !def.members.some((m) => m.id === l));
              if (free) change({ members: [...def.members, { id: free, strategyId: e.target.value }] });
            }}
            className="rounded-lg border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary outline-none disabled:opacity-40"
          >
            <option value="">+ Add a strategy…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.symbol}, {s.timeframe}
              </option>
            ))}
          </select>
          {available.length === 0 && <span className="ml-2 text-xs text-brand-navy/40">{strategies.length === 0 ? "You have no strategies yet — build one first, or use rules of your own." : "All your strategies are already added."}</span>}
        </div>
      </Section>

      <Section step={3} title="Entry logic" subtitle="When to open the position">
        {def.entry ? <LogicEditor node={def.entry} onChange={(n) => change({ entry: n })} members={memberOptions} /> : <button type="button" onClick={() => change({ entry: startLogic() })} className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"><Plus size={13} /> Start the entry logic</button>}
      </Section>

      <Section step={4} title="Exit logic (optional)" subtitle="A rule that closes the position. Stops, targets and a holding limit below can close it too">
        {def.exit ? (
          <>
            <LogicEditor node={def.exit} onChange={(n) => change({ exit: n })} members={memberOptions} />
            <button type="button" onClick={() => change({ exit: null })} className="mt-2 text-xs font-semibold text-brand-sell hover:underline">Remove the exit logic</button>
          </>
        ) : (
          <button type="button" onClick={() => change({ exit: startLogic() })} className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"><Plus size={13} /> Add an exit rule</button>
        )}
      </Section>

      <Section step={5} title="Position & entries" subtitle="How much to buy, and whether to build it in stages">
        <div className="space-y-5">
          <PositionSizingFields mode={def.positionSizingMode} value={def.positionSizingValue} onModeChange={(m) => change({ positionSizingMode: m })} onValueChange={(v) => change({ positionSizingValue: v })} />
          {def.positionSizingMode === "RISK_PERCENT" && !def.stopLoss.enabled && <p className="-mt-3 text-xs font-medium text-brand-sell">Sizing by risk needs a stop-loss. Turn it on in the next section.</p>}
          <EntryPlanFields state={plan} onChange={(p) => { setPlan(p); setDirty(true); setCheck(null); }} direction={def.direction} pyramiding={def.maxPyramidEntries > 1} />
        </div>
      </Section>

      <Section step={6} title="Exits & risk" subtitle="Stop-loss, targets, trailing stop and the holding limit">
        <RiskManagementFields
          stopLoss={def.stopLoss}
          target={def.target}
          trailingSl={def.trailingSl}
          onStopLossChange={(l) => change({ stopLoss: l })}
          onTargetChange={(l) => change({ target: l })}
          onTrailingSlChange={(l) => change({ trailingSl: l })}
        />
        <StagedTargetsFields rows={targetRows} direction={def.direction} singleTargetOn={def.target.enabled} onChange={(rows) => { setTargetRows(rows); setDirty(true); setCheck(null); if (rows.length > 0 && def.target.enabled) change({ target: { ...def.target, enabled: false } }); }} />
        {intraday && !swingish && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-brand-navy/60">
              No new entries after (IST)
              <input type="time" value={def.noEntryAfterMinute != null ? hhmm(def.noEntryAfterMinute) : ""} onChange={(e) => change({ noEntryAfterMinute: e.target.value ? toMin(e.target.value) : null })} className="mt-1 block rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-brand-navy/60">
              Square off at (IST)
              <input type="time" value={def.squareOffMinute != null ? hhmm(def.squareOffMinute) : ""} onChange={(e) => change({ squareOffMinute: e.target.value ? toMin(e.target.value) : null })} className="mt-1 block rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm" />
            </label>
          </div>
        )}
      </Section>

      <Section step={7} title="Check and publish" subtitle="Publishing freezes this plan as a numbered version and creates a strategy you can backtest, forward test and take live">
        <div className="space-y-3">
          {check && (
            <>
              <Issues title="Fix these before publishing" tone="error" items={check.errors} />
              <Issues title="Worth a look" tone="warn" items={check.warnings} />
              {check.entryText && (
                <div className="rounded-xl bg-brand-bg p-3 text-xs text-brand-navy/70">
                  <p><span className="font-semibold text-brand-navy">Enters when: </span>{check.entryText}</p>
                  <p className="mt-1"><span className="font-semibold text-brand-navy">Exit rule: </span>{def.exit ? check.exitText : "none — it exits on its stops, targets or holding limit"}</p>
                </div>
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
            <button type="button" disabled={busy} onClick={runCheck} className="rounded-full border border-brand-navy/25 px-5 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50">
              Check the plan
            </button>
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

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

/** Removes every rule that uses a strategy that is no longer in the workspace. */
function prune(node: LogicNode | null, member: string): LogicNode | null {
  if (!node) return null;
  if (node.type === "strategy") return node.member === member ? null : node;
  if (node.type === "rule") return node;
  return { ...node, children: node.children.map((c) => prune(c, member)).filter((c): c is LogicNode => c !== null) };
}
