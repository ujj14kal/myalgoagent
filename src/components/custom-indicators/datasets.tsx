"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Upload } from "lucide-react";
import { createDataset, deleteDataset, type DatasetRow } from "@/lib/custom-indicator-actions";

const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

/** Your own tables of numbers (a model's scores, a fund flow, anything with a date and a value) for indicators to read with data(name). */
export default function DatasetsPanel({ datasets }: { datasets: DatasetRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 400_000) return setMessage({ ok: false, text: "That file is too large: a dataset holds up to 1,500 rows." });
    setCsv(await f.text());
    if (!name.trim()) setName(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 40));
  };

  const add = () =>
    start(async () => {
      const r = await createDataset({ name, description, csv });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: `Saved. Use it in a formula as data(${r.data?.slug})${r.data?.skipped ? ` (${r.data.skipped} unreadable line${r.data.skipped === 1 ? "" : "s"} skipped)` : ""}.` });
      setName("");
      setDescription("");
      setCsv("");
      router.refresh();
    });

  const field = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <Database size={15} className="text-brand-primary" /> Your datasets ({datasets.length})
          </p>
          <p className="mt-1 text-xs text-brand-navy/50">Upload a table of dates and numbers (for example scores from your own model) and read it in a formula with data(name). A value counts from its own time onwards, never before, so make sure your numbers are point-in-time accurate: a date alone counts from 18:00 that day.</p>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/25">
          {open ? "Close" : "Upload a dataset"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Name</span>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Model score" className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">What it is (optional)</span>
              <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} className={field} />
            </label>
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} spellCheck={false} placeholder={"date, value\n2026-03-10, 0.42\n2026-03-11, 0.55"} className={`${field} font-mono`} />
          <div className="flex flex-wrap items-center gap-3">
            <input ref={file} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-navy/65 ring-1 ring-brand-navy/15">
              <Upload size={13} /> Choose a file
            </button>
            <button type="button" disabled={pending || !name.trim() || !csv.trim()} onClick={add} className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending ? "Saving…" : "Save dataset"}
            </button>
            {message && <p className={`text-xs ${message.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{message.text}</p>}
          </div>
        </div>
      )}

      {datasets.length > 0 && (
        <ul className="mt-4 divide-y divide-black/[0.05]">
          {datasets.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-semibold text-brand-navy">{d.name}</span> <code className="ml-1 rounded bg-brand-navy/[0.05] px-1.5 py-0.5 text-xs">data({d.slug})</code>
                <span className="block text-[11px] text-brand-navy/45">
                  {d.rows.toLocaleString("en-IN")} rows, {day(d.from)} to {day(d.to)}
                  {d.description ? ` · ${d.description}` : ""}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Delete ${d.name}`}
                onClick={() => window.confirm(`Delete “${d.name}”? Indicators already saved with it keep their copy.`) && start(async () => (await deleteDataset(d.id), router.refresh()))}
                className="rounded-full p-2 text-brand-navy/45 hover:text-brand-sell"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
