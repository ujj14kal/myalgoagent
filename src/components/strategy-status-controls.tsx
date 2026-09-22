"use client";

import { useState, useTransition } from "react";
import { archiveStrategyAction, restoreStrategyAction, deleteStrategy, getLivePaperSessionCount } from "@/lib/strategy-actions";

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
  // null = closed, "loading" = checking for live paper sessions, or the
  // live-session count once known. Checked fresh on every click rather
  // than passed in as a prop, since a session's status can change without
  // this page reloading (e.g. the user stopped one in another tab).
  const [confirmState, setConfirmState] = useState<"loading" | number | null>(null);

  async function handleDeleteClick() {
    setConfirmState("loading");
    const count = await getLivePaperSessionCount(strategyId);
    setConfirmState(count);
  }

  function confirmDelete() {
    setConfirmState(null);
    startTransition(() => deleteStrategy(strategyId));
  }

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
        disabled={isPending || confirmState === "loading"}
        onClick={handleDeleteClick}
        className="text-sm text-brand-navy/40 hover:text-brand-sell disabled:opacity-50"
      >
        Delete
      </button>

      {confirmState !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            {confirmState === "loading" ? (
              <p className="text-sm text-brand-navy/60">Checking for live paper trading sessions…</p>
            ) : confirmState > 0 ? (
              <>
                <p className="text-sm font-semibold text-brand-navy">
                  {confirmState} live paper trading session{confirmState === 1 ? "" : "s"} on this strategy
                </p>
                <p className="mt-2 text-xs text-brand-navy/60">
                  Deleting this strategy will move {confirmState === 1 ? "that session" : "those sessions"} to
                  history — {confirmState === 1 ? "it" : "they"} will stop syncing live and no longer appear as
                  active, but all its trade history and P&L stay exactly as they are. This can&apos;t be undone.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmState(null)}
                    className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="rounded-full bg-brand-sell px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    Delete &amp; move to history
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-brand-navy">Delete this strategy?</p>
                <p className="mt-2 text-xs text-brand-navy/60">This can&apos;t be undone.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmState(null)}
                    className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="rounded-full bg-brand-sell px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
