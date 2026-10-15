"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, History, Trash2 } from "lucide-react";
import { useState } from "react";
import InspectIndicator from "./inspect";
import Changes from "./changes";
import FormulaStudio from "./formula-studio";
import DescribeIndicator from "./describe";
import { deleteCustomIndicator, duplicateCustomIndicator, importCustomIndicator, restoreCustomIndicatorVersion, type IndicatorVersion } from "@/lib/custom-indicator-actions";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { CUSTOM_CLASSES, classifyCustom, customParts, describeCustom, PART_LABEL, type CustomClass, type CustomIndicatorDef } from "@/lib/custom-indicator";

export type SavedIndicator = { id: string; name: string; description: string | null; def: CustomIndicatorDef; summary: string; history?: IndicatorVersion[] };

export default function CustomIndicatorList({
  items,
  total,
  counts,
  kind,
  params,
  pager,
}: {
  /** The page shown (searched, filtered and paged on the server). */
  items: SavedIndicator[];
  /** How many the user has in all. */
  total: number;
  /** Per class, after the search. */
  counts: Record<CustomClass, number>;
  kind: CustomClass | "all";
  params: Record<string, string | undefined>;
  pager: React.ReactNode;
}) {
  const [, start] = useTransition();
  const router = useRouter();
  const searchedTotal = CUSTOM_CLASSES.reduce((n, c) => n + counts[c], 0);
  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <p className="text-sm font-semibold text-brand-navy">Create a custom indicator</p>
        <p className="mt-1 text-xs text-brand-navy/50">Describe it in your own words. Your assistant writes the formula you can read and shows it to you to review before anything is saved.</p>
        <div className="mt-4">
          <DescribeIndicator />
        </div>
        <FormulaStudio />
        <ImportBox />
      </section>
      {total > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-sm font-semibold text-brand-navy">Your custom indicators ({total})</p>
          <ListTabs
            basePath="/app/indicators"
            params={params}
            name="kind"
            tabs={[{ value: "all", label: "All", count: searchedTotal }, ...CUSTOM_CLASSES.filter((c) => counts[c] > 0 || c === kind).map((c) => ({ value: c, label: c, count: counts[c] }))]}
            active={kind}
          />
          <ListToolbar
            basePath="/app/indicators"
            params={params}
            search={{ placeholder: "Search name, formula or description…" }}
            selects={[{ name: "sort", label: "Sort", options: [{ value: "updated", label: "Recently changed" }, { value: "created", label: "Newest first" }, { value: "name", label: "Name A–Z" }] }]}
          />
        </div>
      )}
      {total > 0 && items.length === 0 && <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">None match.</p>}
      {items.map((i) => (
        <section key={i.id} className="surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-brand-navy">
                  {i.def.color && <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: i.def.color }} />}
                  {i.name}{" "}
                  <span className="ml-1 rounded-full bg-brand-navy/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/55">
                    {classifyCustom(i.def)}
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-brand-navy/70">{i.summary}</p>
                {customParts(i.def).length > 1 && <p className="mt-1 text-[11px] text-brand-navy/50">Rules can read: {customParts(i.def).map((p) => PART_LABEL[p]).join(" · ")}</p>}
                {i.description && <p className="mt-1 text-xs text-brand-navy/55">{i.description}</p>}
              </div>
              <div className="flex gap-1">
                <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => start(async () => (await duplicateCustomIndicator(i.id), router.refresh()))} className="rounded-full p-2 text-brand-navy/45 hover:text-brand-primary">
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => window.confirm(`Delete “${i.name}”? Strategies already using it keep their copy.`) && start(async () => (await deleteCustomIndicator(i.id), router.refresh()))}
                  className="rounded-full p-2 text-brand-navy/45 hover:text-brand-sell"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <InspectIndicator def={i.def} />
              <ExportButton name={i.name} description={i.description} def={i.def} />
            </div>
            {i.history && i.history.length > 0 && <Versions id={i.id} versions={i.history} current={i.summary} />}
        </section>
      ))}
      {pager}
    </div>
  );
}

/** Copies the indicator as text another account can import. */
function ExportButton({ name, description, def }: { name: string; description: string | null; def: CustomIndicatorDef }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify({ name, description, def }, null, 2));
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this text:", JSON.stringify({ name, description, def }));
        }
      }}
      className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-navy/60 ring-1 ring-brand-navy/15 hover:text-brand-primary"
    >
      {done ? "Copied" : "Copy as text"}
    </button>
  );
}

/** Earlier versions of an indicator, newest first; restoring one keeps the current one in the list. */
function Versions({ id, versions, current }: { id: string; versions: IndicatorVersion[]; current: string }) {
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState<number | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy/55 hover:text-brand-primary">
        <History size={13} /> {versions.length} earlier version{versions.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {versions.map((v, n) => (
            <li key={v.at} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-brand-bg/60 px-3 py-1.5 text-xs">
              <span className="text-brand-navy/45">{new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
              <span className="min-w-0 flex-1 break-all font-mono text-brand-navy/70">{v.name}: {describeCustom(v.def)}</span>
              <button type="button" onClick={() => setCompare(compare === n ? null : n)} className="font-semibold text-brand-navy/55 hover:text-brand-primary">
                {compare === n ? "Hide changes" : "Compare"}
              </button>
              {compare === n && <Changes before={describeCustom(v.def)} after={current} />}
              <button type="button" onClick={() => window.confirm("Restore this version? The current one stays in the list.") && start(async () => (await restoreCustomIndicatorVersion(id, n), router.refresh()))} className="font-semibold text-brand-primary">
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Paste text copied with “Copy as text” to add that indicator to this account. */
function ImportBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-brand-primary">
        Import an indicator from text
      </button>
    );
  return (
    <div className="mt-3 space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the text copied with “Copy as text”" className="w-full rounded-lg border border-brand-navy/15 p-2 font-mono text-xs outline-none focus:border-brand-primary" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await importCustomIndicator(text);
              setMsg(r.ok ? "Added." : r.error);
              if (r.ok) {
                setText("");
                router.refresh();
              }
            })
          }
          className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Add it
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-navy/50">
          Close
        </button>
        {msg && <span className="text-xs text-brand-navy/60">{msg}</span>}
      </div>
    </div>
  );
}
