"use client";

import { useTransition } from "react";
import { archiveStrategyAction, restoreStrategyAction, deleteStrategy } from "@/lib/strategy-actions";

type Status = "DRAFT" | "ACTIVE" | "ARCHIVED";

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-brand-navy/10 text-brand-navy/60",
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  ARCHIVED: "bg-brand-navy/5 text-brand-navy/40",
};

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

/** Draft vs Active is never a manual choice here — it's decided by whether
 * the strategy has actually been put to work (see activateStrategyIfDraft
 * in strategy-actions.ts). The only lifecycle action a user takes directly
 * is archiving one they no longer want in their active list, or restoring
 * it back out of Archived. */
export default function StrategyStatusControls({
  strategyId,
  status,
}: {
  strategyId: string;
  status: Status;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      {status === "ARCHIVED" ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => restoreStrategyAction(strategyId))}
          className="text-sm font-medium text-brand-primary hover:underline disabled:opacity-50"
        >
          Restore
        </button>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => archiveStrategyAction(strategyId))}
          className="text-sm font-medium text-brand-navy/50 hover:text-brand-navy disabled:opacity-50"
        >
          Archive
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (confirm("Delete this strategy? This can't be undone.")) {
            startTransition(() => deleteStrategy(strategyId));
          }
        }}
        className="text-sm text-brand-navy/40 hover:text-brand-sell disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
