"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Pencil, PencilLine, Sigma, Trash2 } from "lucide-react";
import CustomIndicatorEditor from "./editor";
import DrawIndicator from "./draw";
import DescribeIndicator from "./describe";
import { deleteCustomIndicator } from "@/lib/custom-indicator-actions";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { CUSTOM_CLASSES, classifyCustom, customParts, PART_LABEL, type CustomClass, type CustomIndicatorDef } from "@/lib/custom-indicator";

export type SavedIndicator = { id: string; name: string; description: string | null; def: CustomIndicatorDef; summary: string };

export type Prefill = { name: string; description: string | null; def: CustomIndicatorDef };

export default function CustomIndicatorList({
  items,
  total,
  counts,
  kind,
  params,
  pager,
  instruments,
  prefill,
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
  instruments: { id: string; symbol: string; name: string }[];
  prefill?: Prefill | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [how, setHow] = useState<"draw" | "formula" | "describe">(prefill ? "formula" : "draw");
  const [, start] = useTransition();
  const router = useRouter();
  const searchedTotal = CUSTOM_CLASSES.reduce((n, c) => n + counts[c], 0);
  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <p className="text-sm font-semibold text-brand-navy">Create a custom indicator</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
          {(
            [
              ["draw", "Draw on a chart", PencilLine],
              ["formula", "Build from settings", Sigma],
              ["describe", "Describe it", MessageSquareText],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={how === k}
              onClick={() => setHow(k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ${how === k ? "bg-brand-navy text-white ring-brand-navy" : "text-brand-navy/65 ring-brand-navy/15"}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {how === "draw" && <DrawIndicator instruments={instruments} />}
          {how === "formula" && (
            <>
              {prefill && <p className="mb-3 rounded-lg bg-brand-primary/[0.06] px-3 py-2 text-xs text-brand-navy/70">Drafted by your assistant — preview it on a chart, adjust anything, then save.</p>}
              <CustomIndicatorEditor instruments={instruments} initial={prefill ?? undefined} />
            </>
          )}
          {how === "describe" && <DescribeIndicator />}
        </div>
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
          {editing === i.id && i.def.type !== "line" ? (
            <CustomIndicatorEditor instruments={instruments} initial={{ id: i.id, name: i.name, description: i.description, def: i.def }} onDone={() => setEditing(null)} />
          ) : (
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
                {i.def.type !== "line" && (
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
      {pager}
    </div>
  );
}
