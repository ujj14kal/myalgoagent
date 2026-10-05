"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleX, ShieldCheck, Info } from "lucide-react";
import { runReadinessCheck } from "@/lib/live-actions";
import type { Readiness } from "@/lib/live/readiness";

/** Checks a broker is ready for live orders — without placing any order. */
export default function ReadinessCheck({ brokers }: { brokers: { id: string; name: string }[] }) {
  const [broker, setBroker] = useState(brokers[0]?.id ?? "");
  const [result, setResult] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (brokers.length === 0) return <p className="text-sm text-brand-navy/55">Connect a broker for today first.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-navy/65">
        Checks everything a live order needs — your broker login, the static IP brokers see, read access to your account and order book, and the exchange&apos;s stock list. <strong>No order is placed.</strong>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={broker} onChange={(e) => setBroker(e.target.value)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" aria-label="Broker">
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !broker}
          onClick={() =>
            start(async () => {
              setError(null);
              setResult(null);
              const r = await runReadinessCheck(broker);
              if (r.ok) {
                setResult(r.data!);
                router.refresh();
              } else setError(r.error);
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-40"
        >
          <ShieldCheck size={15} /> {pending ? "Checking…" : "Check I'm ready"}
        </button>
      </div>
      {error && <p className="rounded-xl bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>}
      {result && (
        <div className="rounded-xl bg-brand-bg/70 p-3">
          <p className={`mb-2 text-sm font-semibold ${result.ready ? "text-[#0b6b30]" : "text-[#9b1111]"}`}>{result.ready ? "Ready to go live." : "Not ready yet — fix the items marked below."}</p>
          <ol className="space-y-1.5">
            {result.steps.map((s, k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                {s.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-buy" /> : s.info ? <Info size={16} className="mt-0.5 shrink-0 text-[#8a7437]" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-brand-sell" />}
                <span className="min-w-0">
                  <span className="text-brand-navy">{s.step}</span>
                  {s.detail && <span className="block break-words text-xs text-brand-navy/50">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
