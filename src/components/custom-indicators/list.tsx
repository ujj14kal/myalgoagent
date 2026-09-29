"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import CustomIndicatorEditor from "./editor";
import { deleteCustomIndicator } from "@/lib/custom-indicator-actions";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

export type SavedIndicator = { id: string; name: string; description: string | null; def: CustomIndicatorDef; summary: string };

export type Prefill = { name: string; formula: string; pane: "price" | "separate"; description: string | null };

export default function CustomIndicatorList({ items, instruments, prefill }: { items: SavedIndicator[]; instruments: { id: string; symbol: string; name: string }[]; prefill?: Prefill | null }) {
  const [editing, setEditing] = useState<string | "new" | null>(items.length && !prefill ? null : "new");
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <section className="surface p-5">
          <p className="mb-3 text-sm font-semibold text-brand-navy">New custom indicator</p>
          {prefill && <p className="mb-3 rounded-lg bg-brand-primary/[0.06] px-3 py-2 text-xs text-brand-navy/70">Drafted by your assistant — preview it on a chart, adjust anything, then save.</p>}
          <CustomIndicatorEditor instruments={instruments} initial={prefill ?? undefined} onDone={items.length ? () => setEditing(null) : undefined} />
        </section>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New custom indicator
        </button>
      )}
      {items.map((i) => (
        <section key={i.id} className="surface p-4">
          {editing === i.id && i.def.type === "formula" ? (
            <CustomIndicatorEditor instruments={instruments} initial={{ id: i.id, name: i.name, description: i.description, formula: i.def.formula, pane: i.def.pane }} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-brand-navy">
                  {i.name}{" "}
                  <span className="ml-1 rounded-full bg-brand-navy/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy/55">
                    {i.def.type === "line" ? "drawn line" : i.def.pane === "price" ? "on price" : "own pane"}
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-brand-navy/70">{i.summary}</p>
                {i.description && <p className="mt-1 text-xs text-brand-navy/55">{i.description}</p>}
              </div>
              <div className="flex gap-1">
                {i.def.type === "formula" && (
                  <button type="button" onClick={() => setEditing(i.id)} aria-label="Edit" className="rounded-full p-2 text-brand-navy/45 hover:text-brand-primary">
                    <Pencil size={14} />
                  </button>
                )}
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
          )}
        </section>
      ))}
    </div>
  );
}
