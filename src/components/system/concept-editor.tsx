"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { CONNECTION_HELP, CONNECTION_LABEL, DEFAULT_BARS, usesBars } from "@/lib/workspace/compile";
import { CONNECTIONS, type Connection } from "@/lib/workspace/types";
import { checkConcept, deleteConcept, duplicateConcept, saveConcept } from "@/lib/system-actions";
import { TIMEFRAME_ROLES, type ConceptClass, type ConceptNode, type SystemIssue, type TimeframeRole } from "@/lib/system/types";
import { friendlyError } from "@/lib/friendly-error";

// The Concept Builder: blocks combined into one setup — all at once, in sequence within N candles, confirmed by,
// unless, only after — with optional blocks that raise confidence and each block read on a timeframe role. A concept
// is classified bullish or bearish and only ever says "setup valid": it never trades.

export type BlockOption = { id: string; name: string; text: string };
const selectCls = "rounded-lg border border-brand-navy/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-primary";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40";
const ROLE_TEXT: Record<TimeframeRole, string> = { primary: "primary timeframe", confirmation: "confirmation timeframe", higher: "higher timeframe" };
const MAX_DEPTH = 4;

function BlockLeaf({ node, blocks, onChange, onRemove }: { node: Extract<ConceptNode, { type: "block" }>; blocks: BlockOption[]; onChange: (n: ConceptNode) => void; onRemove: () => void }) {
  const b = blocks.find((x) => x.id === node.blockId);
  return (
    <div className={`rounded-lg p-2.5 ${node.optional ? "border border-dashed border-brand-navy/20 bg-white" : "bg-brand-bg"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={node.blockId} aria-label="Block" onChange={(e) => onChange({ ...node, blockId: e.target.value })} className={`${selectCls} min-w-0 flex-1 font-medium`}>
          {!b && <option value={node.blockId}>(deleted block)</option>}
          {blocks.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <select value={node.timeframe ?? "primary"} aria-label="Read on" onChange={(e) => onChange({ ...node, timeframe: e.target.value === "primary" ? undefined : (e.target.value as TimeframeRole) })} className={selectCls}>
          {TIMEFRAME_ROLES.map((r) => (
            <option key={r} value={r}>on the {ROLE_TEXT[r]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-brand-navy/65">
          <input type="checkbox" checked={!!node.optional} onChange={(e) => onChange({ ...node, optional: e.target.checked || undefined })} />
          optional
        </label>
        <button type="button" aria-label="Remove block" onClick={onRemove} className="rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell"><Trash2 size={14} /></button>
      </div>
      {b?.text && <p className="mt-1.5 truncate text-xs text-brand-navy/45" title={b.text}>{b.text}</p>}
      {node.optional && <p className="mt-1 text-[11px] text-brand-navy/45">Optional: doesn&rsquo;t decide whether the setup is valid; when present it raises the setup&rsquo;s confidence.</p>}
    </div>
  );
}

function LogicTree({ node, blocks, onChange, onRemove, depth = 0 }: { node: ConceptNode; blocks: BlockOption[]; onChange: (n: ConceptNode) => void; onRemove?: () => void; depth?: number }) {
  if (node.type === "block") return <BlockLeaf node={node} blocks={blocks} onChange={onChange} onRemove={onRemove ?? (() => {})} />;
  const g = node;
  const bars = g.bars ?? DEFAULT_BARS[g.connection] ?? 1;
  const setChild = (i: number, c: ConceptNode) => onChange({ ...g, children: g.children.map((x, j) => (j === i ? c : x)) });
  const removeChild = (i: number) => onChange({ ...g, children: g.children.filter((_, j) => j !== i) });
  const unused = blocks.find((b) => !g.children.some((c) => c.type === "block" && c.blockId === b.id)) ?? blocks[0];
  return (
    <div className={`rounded-xl border border-brand-navy/15 p-3 ${depth > 0 ? "bg-white" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={g.connection} aria-label="How these blocks combine" onChange={(e) => onChange({ ...g, connection: e.target.value as Connection, bars: undefined })} className={`${selectCls} font-semibold`}>
          {CONNECTIONS.map((c) => (
            <option key={c} value={c}>{CONNECTION_LABEL[c]}</option>
          ))}
        </select>
        {usesBars(g.connection) && (
          <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
            within
            <input type="number" min={1} max={500} value={bars} aria-label="Look-back window in candles" onChange={(e) => onChange({ ...g, bars: Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)) })} className="w-16 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary" />
            candles
          </label>
        )}
        {onRemove && (
          <button type="button" aria-label="Remove group" onClick={onRemove} className="ml-auto rounded-full p-1.5 text-brand-navy/40 hover:bg-brand-bg hover:text-brand-sell"><Trash2 size={14} /></button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-brand-navy/50">{CONNECTION_HELP[g.connection]} Optional blocks are left out of this and only add confidence.</p>
      <div className="mt-3 space-y-2">
        {g.children.length === 0 && <p className="rounded-lg border border-dashed border-brand-navy/20 px-3 py-3 text-center text-xs text-brand-navy/40">No blocks here yet.</p>}
        {g.children.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-center text-xs font-semibold text-brand-navy/35">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <LogicTree node={c} blocks={blocks} onChange={(n) => setChild(i, n)} onRemove={() => removeChild(i)} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!unused} onClick={() => unused && onChange({ ...g, children: [...g.children, { type: "block", blockId: unused.id }] })} className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-40">
          <Plus size={13} /> Block
        </button>
        {depth < MAX_DEPTH && (
          <button type="button" onClick={() => onChange({ ...g, children: [...g.children, { type: "group", connection: g.connection === "AND" ? "OR" : "AND", children: [] }] })} className="inline-flex items-center gap-1 rounded-full border border-brand-navy/20 px-3 py-1.5 text-xs font-semibold text-brand-navy/70 hover:bg-brand-bg">
            <Plus size={13} /> Group
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConceptEditor({
  id,
  initialName = "",
  initialDescription = "",
  initialClassification = "BULLISH",
  initialLogic = null,
  blocks,
  usedBy = [],
}: {
  id?: string;
  initialName?: string;
  initialDescription?: string;
  initialClassification?: ConceptClass;
  initialLogic?: ConceptNode | null;
  blocks: BlockOption[];
  usedBy?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [classification, setClassification] = useState<ConceptClass>(initialClassification);
  const [logic, setLogic] = useState<ConceptNode>(initialLogic ?? { type: "group", connection: "SEQUENCE", bars: 10, children: [] });
  const [issues, setIssues] = useState<SystemIssue[] | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(!id);
  const [busy, start] = useTransition();
  const definition = { schema: 1, logic };

  const edit = (n: ConceptNode) => {
    setLogic(n);
    setDirty(true);
    setIssues(null);
  };

  function check() {
    start(async () => {
      const r = await checkConcept(definition);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      setIssues(r.issues);
      setText(r.text);
      setMessage(r.issues.length ? { tone: "error", text: "Fix the items below before a trading system can use this concept." } : { tone: "ok", text: "The concept is complete." });
    });
  }

  function save() {
    start(async () => {
      const r = await saveConcept({ id, name, description, classification, definition });
      if ("error" in r) return setMessage({ tone: "error", text: friendlyError(r.error, "Couldn't save the concept.") });
      setIssues(r.issues);
      setText(r.text);
      setDirty(false);
      setMessage(r.issues.length ? { tone: "error", text: "Saved, but it isn't complete yet — see below." } : { tone: "ok", text: "Concept saved. Add it to a trading system." });
      if (!id) router.replace(`/app/workspaces/concepts/${r.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!id || !confirm(`Delete the concept “${name}”? Published trading systems keep their own copy.`)) return;
    start(async () => {
      const r = await deleteConcept(id);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      router.push("/app/workspaces?tab=concepts");
    });
  }

  function duplicate() {
    if (!id) return;
    start(async () => {
      const r = await duplicateConcept(id);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      router.push(`/app/workspaces/concepts/${r.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="concept-name">Concept name</label>
            <input id="concept-name" type="text" value={name} maxLength={80} placeholder="e.g. My Bullish SMC Entry" onChange={(e) => { setName(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
          <div>
            <label className={label} htmlFor="concept-desc">Notes (optional)</label>
            <input id="concept-desc" type="text" value={description} maxLength={500} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
        </div>
        <div className="mt-4">
          <span className={label}>Classification</span>
          <div className="flex w-fit overflow-hidden rounded-full border border-brand-navy/15" role="radiogroup" aria-label="Classification">
            {(["BULLISH", "BEARISH"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={classification === c} onClick={() => { setClassification(c); setDirty(true); }} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium ${classification === c ? (c === "BULLISH" ? "bg-brand-buy text-white" : "bg-brand-sell text-white") : "text-brand-navy/60 hover:bg-brand-bg"}`}>
                {c === "BULLISH" ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {c === "BULLISH" ? "Bullish" : "Bearish"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-brand-navy/45">The concept&rsquo;s output is “{classification === "BULLISH" ? "Bullish" : "Bearish"} setup valid”. Whether that opens, closes or reverses a position is the trading system&rsquo;s decision.</p>
        </div>
      </section>

      <section className="surface p-4 sm:p-5">
        <p className="text-sm font-semibold text-brand-navy">How the blocks combine</p>
        <p className="mb-3 text-xs text-brand-navy/50">Example: Liquidity sweep → BOS → FVG → FVG retest, in order, each within 10 candles; a higher-timeframe trend block as optional.</p>
        {blocks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-brand-navy/20 px-3 py-4 text-center text-sm text-brand-navy/55">
            You have no blocks yet. <Link href="/app/workspaces/blocks/new" className="font-semibold text-brand-primary hover:underline">Create a block</Link> first — a concept is built from them.
          </p>
        ) : (
          <LogicTree node={logic} blocks={blocks} onChange={edit} />
        )}
        <p className="mt-2 text-xs text-brand-navy/45">Each block is read on the primary timeframe unless you choose the confirmation or higher one; the trading system that uses this concept sets what those are.</p>
      </section>

      <section className="surface space-y-3 p-4 sm:p-5">
        {text && (
          <p className="rounded-lg bg-brand-bg px-3 py-2 text-xs text-brand-navy/70">
            <span className="font-semibold text-brand-navy">{classification === "BULLISH" ? "Bullish" : "Bearish"} setup valid when: </span>
            {text}
          </p>
        )}
        {issues && issues.length > 0 && (
          <div className="rounded-xl bg-brand-sell/[0.07] p-3 text-xs text-brand-sell">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> To fix</p>
            <ul className="mt-1 space-y-1">{issues.map((it, i) => <li key={i}>{it.message}</li>)}</ul>
          </div>
        )}
        {message && (
          <p className={`flex items-center gap-1.5 text-sm font-medium ${message.tone === "ok" ? "text-brand-buy" : "text-brand-sell"}`} role="status">
            {message.tone === "ok" && <CheckCircle2 size={15} />} {message.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={save} className="rounded-full bg-brand-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Working…" : id ? (dirty ? "Save concept" : "Saved") : "Create concept"}
          </button>
          <button type="button" disabled={busy} onClick={check} className="rounded-full border border-brand-navy/25 px-5 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50">Check</button>
          {id && (
            <>
              <button type="button" disabled={busy} onClick={duplicate} className="inline-flex items-center gap-1 rounded-full border border-brand-navy/20 px-4 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50"><Copy size={14} /> Duplicate</button>
              <button type="button" disabled={busy || usedBy.length > 0} title={usedBy.length ? "Remove it from the trading systems that use it first" : undefined} onClick={remove} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-brand-sell hover:bg-brand-sell/5 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
            </>
          )}
        </div>
        {id && (
          <p className="text-xs text-brand-navy/50">
            {usedBy.length ? (
              <>
                Used by{" "}
                {usedBy.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    <Link href={`/app/workspaces/${s.id}`} className="font-semibold text-brand-primary hover:underline">{s.name}</Link>
                  </span>
                ))}
                . Changes reach their next published version; versions already published keep their copy.
              </>
            ) : (
              "Not used by any trading system yet."
            )}
          </p>
        )}
      </section>
    </div>
  );
}
