"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Zap } from "lucide-react";
import { runJobNow, setJobSchedule } from "@/lib/admin/actions";
import type { JobName } from "@/lib/jobs";

export default function JobControls({ job, enabled }: { job: JobName; enabled: boolean | null }) {
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const go = (fn: () => ReturnType<typeof runJobNow>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setFlash(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
      router.refresh();
    });
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${btn} bg-brand-primary text-white ring-brand-primary hover:bg-brand-primary-light`}
        onClick={() => go(() => runJobNow(job), job === "purge-deleted-accounts" ? "Permanently delete every account whose 15-day window has passed, now?" : undefined)}
      >
        <Zap size={12} /> {pending ? "Running…" : "Run now"}
      </button>
      {enabled !== null && (
        <button
          type="button"
          disabled={pending}
          className={`${btn} bg-white text-brand-navy/70 ring-black/10`}
          onClick={() => go(() => setJobSchedule(job, !enabled), enabled ? "Pause the schedule? It won't run until you resume it." : undefined)}
        >
          {enabled ? <Pause size={12} /> : <Play size={12} />} {enabled ? "Pause schedule" : "Resume schedule"}
        </button>
      )}
      {flash && <span className={`text-xs font-medium ${flash.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{flash.text}</span>}
    </div>
  );
}
