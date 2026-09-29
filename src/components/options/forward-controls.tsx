"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Square, Trash2 } from "lucide-react";
import { checkOptionForwardTestNow, deleteOptionForwardTest, stopOptionForwardTest } from "@/lib/option-strategy-actions";
import { inMarketWindow } from "@/lib/paper/market-window";

/** Check now / stop / delete, and a quiet re-check every minute while the market is open. */
export default function ForwardControls({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (!document.hidden && inMarketWindow(new Date())) start(async () => (await checkOptionForwardTestNow(id), router.refresh()));
    }, 60_000);
    return () => clearInterval(t);
  }, [id, active, router]);
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 disabled:opacity-40";
  return (
    <div className="flex flex-wrap gap-2">
      {active && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await checkOptionForwardTestNow(id);
                if (!r.ok) window.alert(r.error);
                router.refresh();
              })
            }
            className={`${btn} text-brand-primary ring-brand-primary/30`}
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> Check now
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => window.confirm("Stop this forward test? Its results so far are kept.") && start(async () => (await stopOptionForwardTest(id), router.refresh()))}
            className={`${btn} text-brand-navy/70 ring-black/10`}
          >
            <Square size={12} /> Stop
          </button>
        </>
      )}
      {!active && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            window.confirm("Delete this forward test and its results?") && start(async () => (await deleteOptionForwardTest(id), router.push("/app/options/strategies")))
          }
          className={`${btn} text-brand-sell ring-brand-sell/30`}
        >
          <Trash2 size={13} /> Delete
        </button>
      )}
    </div>
  );
}
