"use client";

import { useState, useTransition } from "react";
import { syncPaperSessionAction, setPaperSessionStatus } from "@/lib/paper-actions";

const STATUSES = ["ACTIVE", "PAUSED", "STOPPED"] as const;

export default function PaperSessionControls({
  sessionId,
  status,
}: {
  sessionId: string;
  status: (typeof STATUSES)[number];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSync() {
    setError(null);
    startTransition(async () => {
      try {
        await syncPaperSessionAction(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending || status !== "ACTIVE"}
          className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Syncing…" : "Sync now"}
        </button>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => startTransition(() => setPaperSessionStatus(sessionId, e.target.value as typeof status))}
          className="rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm outline-none focus:border-brand-primary"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}
    </div>
  );
}
