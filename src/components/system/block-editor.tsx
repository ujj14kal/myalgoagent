"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, Trash2 } from "lucide-react";
import ConditionGroupEditor, { ConditionOverridesContext } from "@/components/condition-group-editor";
import { conditionToText } from "@/lib/strategy/format";
import type { ConditionNode } from "@/lib/strategy/types";
import { deleteBlock, duplicateBlock, saveBlock } from "@/lib/system-actions";
import { BLANK_BLOCK_CONDITION, BLOCK_TEMPLATES } from "@/lib/system/templates";
import type { SystemIssue } from "@/lib/system/types";
import { friendlyError } from "@/lib/friendly-error";

// The Block Builder: one reusable market component (My BOS, My FVG, a session, a level) as a rule — and nothing else.
// No instrument, side, size, stop or target: the concept combines blocks, the trading system makes the decisions.

const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40";
const asGroup = (c: ConditionNode): ConditionNode => (c.kind === "group" ? c : { kind: "group", op: "AND", children: [c] });

export default function BlockEditor({
  id,
  initialName = "",
  initialDescription = "",
  initialCondition,
  usedBy = [],
}: {
  id?: string;
  initialName?: string;
  initialDescription?: string;
  initialCondition?: ConditionNode;
  /** Concepts that use this block (it can't be deleted while any do). */
  usedBy?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [condition, setCondition] = useState<ConditionNode>(asGroup(initialCondition ?? BLANK_BLOCK_CONDITION));
  const [issues, setIssues] = useState<SystemIssue[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(!id);
  const [busy, start] = useTransition();
  let text = "";
  try {
    text = conditionToText(condition);
  } catch {
    text = "";
  }

  const edit = (c: ConditionNode) => {
    setCondition(c);
    setDirty(true);
    setIssues([]);
  };

  function applyTemplate(key: string) {
    const t = BLOCK_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    edit(asGroup(t.condition));
    if (!name.trim()) setName(t.name);
  }

  function save() {
    start(async () => {
      const r = await saveBlock({ id, name, description, definition: { schema: 1, condition } });
      if ("error" in r) return setMessage({ tone: "error", text: friendlyError(r.error, "Couldn't save the block.") });
      setIssues(r.issues);
      setDirty(false);
      setMessage({ tone: "ok", text: r.issues.length ? "Saved — but have a look at the notes below." : "Block saved. Use it in any concept." });
      if (!id) router.replace(`/app/workspaces/blocks/${r.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!id || !confirm(`Delete the block “${name}”? Published trading systems keep their own copy.`)) return;
    start(async () => {
      const r = await deleteBlock(id);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      router.push("/app/workspaces?tab=blocks");
    });
  }

  function duplicate() {
    if (!id) return;
    start(async () => {
      const r = await duplicateBlock(id);
      if ("error" in r) return setMessage({ tone: "error", text: r.error });
      router.push(`/app/workspaces/blocks/${r.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="block-name">Block name</label>
            <input id="block-name" type="text" value={name} maxLength={80} placeholder="e.g. My BOS" onChange={(e) => { setName(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
          <div>
            <label className={label} htmlFor="block-desc">Notes (optional)</label>
            <input id="block-desc" type="text" value={description} maxLength={500} placeholder="What this component means to you" onChange={(e) => { setDescription(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-brand-bg px-3 py-2 text-xs text-brand-navy/60">
          A block answers one question: <span className="font-semibold text-brand-navy">“is this market component present on this candle?”</span> It has no instrument, side, size, stop or target. Concepts combine blocks into setups; trading systems decide what to trade.
        </p>
      </section>

      {!id && (
        <section className="surface p-4 sm:p-5">
          <p className="text-sm font-semibold text-brand-navy">Start from a component</p>
          <p className="text-xs text-brand-navy/50">Pick one, then tune it below (swing size, levels, times). Or start blank.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BLOCK_TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => applyTemplate(t.key)} className="rounded-xl border border-brand-navy/10 p-3 text-left hover:border-brand-primary">
                <span className="block text-sm font-semibold text-brand-navy">{t.name}</span>
                <span className="block text-xs text-brand-navy/50">{t.about}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="surface p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-brand-navy">The component&rsquo;s rule</p>
        {/* A block never chooses an instrument: no "on another stock" option here. */}
        <ConditionOverridesContext.Provider value={false}>
          <ConditionGroupEditor node={condition} onChange={edit} />
        </ConditionOverridesContext.Provider>
        {text && (
          <p className="mt-3 rounded-lg bg-brand-bg px-3 py-2 text-xs text-brand-navy/70">
            <span className="font-semibold text-brand-navy">Present when: </span>
            {text}
          </p>
        )}
        <p className="mt-2 text-xs text-brand-navy/45">Read on the trading system&rsquo;s primary timeframe unless a concept reads it on its confirmation or higher timeframe. Parts that name their own timeframe keep it.</p>
      </section>

      <section className="surface space-y-3 p-4 sm:p-5">
        {issues.length > 0 && (
          <div className="rounded-xl bg-brand-gold/10 p-3 text-xs text-brand-navy/75">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Worth a look</p>
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
            {busy ? "Working…" : id ? (dirty ? "Save block" : "Saved") : "Create block"}
          </button>
          {id && (
            <>
              <button type="button" disabled={busy} onClick={duplicate} className="inline-flex items-center gap-1 rounded-full border border-brand-navy/20 px-4 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50"><Copy size={14} /> Duplicate</button>
              <button type="button" disabled={busy || usedBy.length > 0} title={usedBy.length ? "Remove it from the concepts that use it first" : undefined} onClick={remove} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-brand-sell hover:bg-brand-sell/5 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
            </>
          )}
        </div>
        {id && (
          <p className="text-xs text-brand-navy/50">
            {usedBy.length ? (
              <>
                Used by{" "}
                {usedBy.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link href={`/app/workspaces/concepts/${c.id}`} className="font-semibold text-brand-primary hover:underline">{c.name}</Link>
                  </span>
                ))}
                . Saving changes those concepts&rsquo; drafts; published versions keep the copy they were published with.
              </>
            ) : (
              "Not used by any concept yet."
            )}
          </p>
        )}
      </section>
    </div>
  );
}
