"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueOptionBacktest } from "@/lib/option-strategy-actions";

/** Drives a RUNNING options backtest chunk by chunk (each request simulates ~10 days) and shows progress. */
export default function RunProgress({ runId, daysDone, daysTotal }: { runId: string; daysDone: number; daysTotal: number }) {
  const [done, setDone] = useState(daysDone);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      for (let failures = 0; alive.current; ) {
        const r = await continueOptionBacktest(runId).catch(() => null);
        if (!alive.current) return;
        if (!r || !r.ok) {
          if (++failures >= 3) return setError(r && !r.ok ? r.error : "Lost connection — reload to resume.");
          continue;
        }
        failures = 0;
        setDone(r.data!.daysDone);
        if (r.data!.status !== "RUNNING") return router.refresh();
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [runId, router]);

  const pct = daysTotal ? Math.min(100, (done / daysTotal) * 100) : 0;
  return (
    <section className="surface p-6">
      <p className="text-sm font-semibold text-brand-navy">Replaying {daysTotal} trading days on real option prices…</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.06]">
        <div className="h-full bg-brand-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-brand-navy/55">
        {done} of {daysTotal} days · keep this page open; it resumes where it left off if you come back.
      </p>
      {error && <p className="mt-2 text-sm text-brand-sell">{error}</p>}
    </section>
  );
}
