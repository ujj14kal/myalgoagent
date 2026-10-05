"use client";

import { Plus, Trash2 } from "lucide-react";
import { parseDsl } from "@/lib/strategy/dsl";
import { CONNECTION_HELP, CONNECTION_LABEL, DEFAULT_BARS, usesBars } from "@/lib/workspace/compile";
import { CONNECTIONS, type Connection, type LogicNode } from "@/lib/workspace/types";

// Builds the entry (or exit) logic of a workspace: strategy rules and rules of your own, connected by groups. Each
// group's connection says exactly how its children relate, in words, right beside the choice.

export type MemberOption = { id: string; name: string; detail: string };

const selectCls = "rounded-lg border border-brand-navy/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-primary";
const MAX_DEPTH = 5;

function newGroup(connection: Connection = "AND"): LogicNode {
  return { type: "group", connection, children: [] };
}

function RuleLeaf({ node, onChange, onRemove }: { node: Extract<LogicNode, { type: "rule" }>; onChange: (n: LogicNode) => void; onRemove: () => void }) {
  const source = node.source ?? "";
  let error: string | null = null;
  if (source.trim()) {
    try {
      parseDsl(source);
    } catch (err) {
      error = err instanceof Error ? err.message : "That rule isn't valid";
    }
  }
  return (
    <div className="rounded-lg bg-brand-bg p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/50">Rule</span>
        <input
          type="text"
          value={node.label ?? ""}
          maxLength={60}
          placeholder="Name (optional), e.g. Trend filter"
          aria-label="Rule name"
          onChange={(e) => onChange({ ...node, label: e.target.value || undefined })}
          className="min-w-0 flex-1 rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary"
        />
        <button type="button" aria-label="Remove rule" onClick={onRemove} className="rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell">
          <Trash2 size={14} />
        </button>
      </div>
      <input
        type="text"
        value={source}
        aria-label="Rule"
        placeholder="e.g. rsi(14) < 30   or   close crossesAbove sma(50)"
        onChange={(e) => {
          const text = e.target.value;
          try {
            onChange({ ...node, source: text, condition: parseDsl(text) });
          } catch {
            onChange({ ...node, source: text });
          }
        }}
        className="mt-2 w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-1.5 font-mono text-[13px] outline-none focus:border-brand-primary"
      />
      {error ? <p className="mt-1 text-xs font-medium text-brand-sell">{error}</p> : source.trim() ? <p className="mt-1 text-xs text-brand-navy/40">Same rule language as &ldquo;Write code&rdquo; in the strategy builder.</p> : <p className="mt-1 text-xs text-brand-navy/40">Type a rule: an indicator test, a price level, a time window.</p>}
    </div>
  );
}

export default function LogicEditor({
  node,
  onChange,
  members,
  depth = 0,
  onRemove,
}: {
  node: LogicNode;
  onChange: (n: LogicNode) => void;
  members: MemberOption[];
  depth?: number;
  onRemove?: () => void;
}) {
  if (node.type === "rule") return <RuleLeaf node={node} onChange={onChange} onRemove={onRemove ?? (() => {})} />;

  if (node.type === "strategy") {
    const known = members.some((m) => m.id === node.member);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-bg p-2.5">
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navy/50">Strategy</span>
        <select value={node.member} aria-label="Strategy" onChange={(e) => onChange({ ...node, member: e.target.value })} className={`${selectCls} min-w-0 flex-1`}>
          {!known && <option value={node.member}>{node.member} (removed)</option>}
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {m.name}
            </option>
          ))}
        </select>
        <select value={node.rule} aria-label="Which rule" onChange={(e) => onChange({ ...node, rule: e.target.value as "ENTRY" | "EXIT" })} className={selectCls}>
          <option value="ENTRY">entry rule</option>
          <option value="EXIT">exit rule</option>
        </select>
        <button type="button" aria-label="Remove strategy rule" onClick={onRemove} className="rounded-full p-1.5 text-brand-navy/40 hover:bg-white hover:text-brand-sell">
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  const g = node;
  const setChild = (i: number, child: LogicNode) => onChange({ ...g, children: g.children.map((c, j) => (j === i ? child : c)) });
  const removeChild = (i: number) => onChange({ ...g, children: g.children.filter((_, j) => j !== i) });
  const add = (child: LogicNode) => onChange({ ...g, children: [...g.children, child] });
  const bars = g.bars ?? DEFAULT_BARS[g.connection] ?? 1;

  return (
    <div className={`rounded-xl border border-brand-navy/15 p-3 ${depth > 0 ? "bg-white" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={g.connection} aria-label="How these are connected" onChange={(e) => onChange({ ...g, connection: e.target.value as Connection, bars: undefined })} className={`${selectCls} font-semibold`}>
          {CONNECTIONS.map((c) => (
            <option key={c} value={c}>
              {CONNECTION_LABEL[c]}
            </option>
          ))}
        </select>
        {usesBars(g.connection) && (
          <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
            within
            <input type="number" min={1} max={500} step={1} value={bars} aria-label="Look-back window in candles" onChange={(e) => onChange({ ...g, bars: Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)) })} className="w-16 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary" />
            candles
          </label>
        )}
        {onRemove && (
          <button type="button" aria-label="Remove group" onClick={onRemove} className="ml-auto rounded-full p-1.5 text-brand-navy/40 hover:bg-brand-bg hover:text-brand-sell">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-brand-navy/50">{CONNECTION_HELP[g.connection]}</p>

      <div className="mt-3 space-y-2">
        {g.children.length === 0 && <p className="rounded-lg border border-dashed border-brand-navy/20 px-3 py-3 text-center text-xs text-brand-navy/40">Nothing here yet. Add a strategy rule or a rule of your own.</p>}
        {g.children.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-center text-xs font-semibold text-brand-navy/35">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <LogicEditor node={c} onChange={(n) => setChild(i, n)} members={members} depth={depth + 1} onRemove={() => removeChild(i)} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={members.length === 0} title={members.length === 0 ? "Add a strategy to this workspace first" : undefined} onClick={() => add({ type: "strategy", member: (members.find((m) => !g.children.some((c) => c.type === "strategy" && c.member === m.id)) ?? members[0]).id, rule: "ENTRY" })} className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-40">
          <Plus size={13} /> Strategy rule
        </button>
        <button type="button" onClick={() => add({ type: "rule", condition: parseDsl("close > 0"), source: "" })} className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5">
          <Plus size={13} /> Rule of your own
        </button>
        {depth < MAX_DEPTH && (
          <button type="button" onClick={() => add(newGroup(g.connection === "AND" ? "OR" : "AND"))} className="inline-flex items-center gap-1 rounded-full border border-brand-navy/20 px-3 py-1.5 text-xs font-semibold text-brand-navy/70 hover:bg-brand-bg">
            <Plus size={13} /> Group
          </button>
        )}
      </div>
    </div>
  );
}

/** A starting point for an empty entry or exit: one AND group. */
export const startLogic = (): LogicNode => newGroup("AND");
