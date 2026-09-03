"use client";

import { useTransition } from "react";
import { setStrategyStatus, deleteStrategy } from "@/lib/strategy-actions";

const STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export default function StrategyStatusControls({
  strategyId,
  status,
}: {
  strategyId: string;
  status: (typeof STATUSES)[number];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => startTransition(() => setStrategyStatus(strategyId, e.target.value as typeof status))}
        className="rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm outline-none focus:border-brand-primary"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (confirm("Delete this strategy? This can't be undone.")) {
            startTransition(() => deleteStrategy(strategyId));
          }
        }}
        className="text-sm text-brand-navy/40 hover:text-brand-sell"
      >
        Delete
      </button>
    </div>
  );
}
