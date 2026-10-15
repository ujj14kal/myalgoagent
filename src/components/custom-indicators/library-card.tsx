"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import { addFromLibrary, rateIndicator, reportIndicator, unpublishIndicator } from "@/lib/custom-indicator/community-actions";

export type LibraryItem = {
  id: string;
  name: string;
  author: string;
  description: string;
  limitations: string | null;
  summary: string;
  repaints: boolean;
  integrityNote: string;
  timing: string[];
  installs: number;
  average: number | null;
  ratings: number;
  mine: boolean;
  myStars: number | null;
};

/** One published indicator: what it is, its formula, whether it repaints, and the buttons to add, rate and report it. */
export default function LibraryCard({ item }: { item: LibraryItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [hover, setHover] = useState(0);
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await f();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: (r as { error?: string }).error ?? "Something went wrong." });
      if (r.ok) router.refresh();
    });

  return (
    <section className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy">
            {item.name} <span className="ml-1 text-xs font-normal text-brand-navy/45">by {item.author}</span>
          </p>
          <p className="mt-1 text-sm text-brand-navy/70">{item.description}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-brand-navy/55">
          <p className="flex items-center justify-end gap-1 font-semibold text-brand-navy">
            <Star size={13} className="fill-brand-gold text-brand-gold" /> {item.average ?? "–"} <span className="font-normal text-brand-navy/45">({item.ratings})</span>
          </p>
          <p>{item.installs.toLocaleString("en-IN")} added</p>
        </div>
      </div>

      <p className="mt-2 break-all rounded-lg bg-brand-bg/70 px-3 py-2 font-mono text-xs text-brand-navy/75">{item.summary}</p>

      <p className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${item.repaints ? "bg-brand-sell/10 text-[#9b1111]" : "bg-brand-buy/10 text-[#0b6b30]"}`}>
        {item.repaints ? <ShieldAlert size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}
        <span>{item.integrityNote}</span>
      </p>
      {item.timing.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-brand-navy/55">
          {item.timing.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {item.limitations && (
        <p className="mt-1.5 text-xs text-brand-navy/60">
          <strong className="text-brand-navy/75">Limits, from the author:</strong> {item.limitations}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {item.mine ? (
          <button type="button" disabled={pending} onClick={() => window.confirm("Take this off the library? People who already added it keep their copy.") && run(() => unpublishIndicator(item.id), "Taken off the library.")} className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-navy/60 ring-1 ring-brand-navy/15 hover:text-brand-sell">
            Unpublish
          </button>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => addFromLibrary(item.id), "Added to your indicators, under “From the library”.")} className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              Add to my indicators
            </button>
            <span className="flex items-center gap-0.5" aria-label="Rate it" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} disabled={pending} onMouseEnter={() => setHover(n)} onClick={() => run(() => rateIndicator(item.id, n), "Thanks for rating.")} className="p-0.5">
                  <Star size={16} className={(hover || item.myStars || 0) >= n ? "fill-brand-gold text-brand-gold" : "text-brand-navy/25"} />
                </button>
              ))}
            </span>
            <button type="button" onClick={() => setReporting(!reporting)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy/45 hover:text-brand-sell">
              <Flag size={12} /> Report
            </button>
          </>
        )}
        {msg && <span className={`text-xs ${msg.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{msg.text}</span>}
      </div>
      {reporting && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="What is wrong with it?" className="min-w-[14rem] flex-1 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary" />
          <button
            type="button"
            disabled={pending || reason.trim().length < 5}
            onClick={() =>
              run(async () => {
                const r = await reportIndicator(item.id, reason);
                if (r.ok) setReporting(false);
                return r;
              }, "Reported. Thank you.")
            }
            className="rounded-full bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Send report
          </button>
        </div>
      )}
    </section>
  );
}
