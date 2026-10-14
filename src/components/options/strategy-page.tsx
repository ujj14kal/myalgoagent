"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, ShieldCheck, ShieldAlert } from "lucide-react";
import StrategyEditor from "@/components/options/strategy-editor";
import { EMPTY_STRATEGY } from "@/lib/options/empty-strategy";
import { readStrategy } from "@/lib/options/describe-strategy";
import type { OptionStrategyInput } from "@/lib/option-strategy-actions";

/** The full-page options strategy builder: the editor on the left, a plain-English reading of it on the right as you build. */
export default function OptionStrategyPage({ initial = EMPTY_STRATEGY, notes = [] }: { initial?: OptionStrategyInput; notes?: string[] }) {
  const router = useRouter();
  const [s, setS] = useState<OptionStrategyInput>(initial);
  const r = readStrategy(s);
  const back = () => router.push("/app/options/strategies");
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {notes.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded-lg bg-brand-gold/10 p-3 pl-7 text-xs text-brand-navy/75">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <section className="surface p-5">
          <StrategyEditor initial={initial} onChange={setS} onDone={() => (router.refresh(), back())} onCancel={back} />
        </section>
      </div>
      <aside className="h-fit space-y-4 lg:sticky lg:top-24">
        <section className="surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Your strategy, in words</p>
          <p className="mt-2 text-lg font-bold text-brand-navy">{r.title}</p>
          {r.outlook && <p className="text-xs text-brand-navy/55">{r.outlook}</p>}
          <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${r.shape.loss === "limited" ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-brand-sell"}`}>
            {r.shape.loss === "limited" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />} {r.shape.text}
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-brand-navy/80">
            {r.legs.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-brand-navy/60">{r.when}</p>
        </section>
        {r.warnings.length > 0 && (
          <section className="rounded-xl bg-brand-gold/10 p-4 text-xs text-brand-navy/75">
            <p className="flex items-center gap-1.5 font-semibold text-brand-navy">
              <AlertTriangle size={14} /> Worth a look
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
        <p className="flex gap-2 text-[11px] leading-relaxed text-brand-navy/45">
          <Info size={13} className="mt-0.5 shrink-0" />
          Strikes are kept as &ldquo;N strikes from at-the-money&rdquo;, so the strategy re-picks them each day it trades. The reading above comes from the shape of your legs, not from prices; backtests use real option prices. Options can lose more than the premium paid — past results do not guarantee future results.
        </p>
      </aside>
    </div>
  );
}
