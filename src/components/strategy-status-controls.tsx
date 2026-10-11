"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  archiveStrategyAction,
  restoreStrategyAction,
  deleteStrategy,
  getLiveDeploymentCount,
  permanentlyDeleteStrategyAction,
  getLivePaperSessionCount,
} from "@/lib/strategy-actions";

type Status = "DRAFT" | "ACTIVE" | "ARCHIVED" | "DELETED";

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-brand-navy/10 text-brand-navy/60",
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  ARCHIVED: "bg-brand-navy/5 text-brand-navy/40",
  DELETED: "bg-brand-sell/10 text-brand-sell",
};

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DELETED: "Deleted",
};

/** Draft vs Active is never a manual choice here — it's decided by whether
 * the strategy has actually been put to work (see activateStrategyIfDraft
 * in strategy-actions.ts). The manual actions a user takes directly are:
 * Archive (sideline it, keep it fully intact and easy to bring back),
 * Delete (soft — moves it to Deleted, same Restore path as Archive), and
 * from Deleted specifically, Delete forever (the one truly irreversible
 * action here, guarded by its own extra confirmation). */
export default function StrategyStatusControls({
  strategyId,
  status,
}: {
  strategyId: string;
  status: Status;
}) {
  const [isPending, startTransition] = useTransition();
  // null = closed, "loading" = checking for live forward tests, or the
  // live-session count once known. Checked fresh on every click rather
  // than passed in as a prop, since a session's status can change without
  // this page reloading (e.g. the user stopped one in another tab).
  const [confirmState, setConfirmState] = useState<"loading" | number | null>(null);
  const [confirmForever, setConfirmForever] = useState(false);

  const [liveBlock, setLiveBlock] = useState(false);

  async function handleDeleteClick() {
    setConfirmState("loading");
    const [count, live] = await Promise.all([getLivePaperSessionCount(strategyId), getLiveDeploymentCount(strategyId)]);
    if (live > 0) {
      setConfirmState(null);
      return setLiveBlock(true);
    }
    setConfirmState(count);
  }

  function confirmDelete() {
    setConfirmState(null);
    startTransition(() => deleteStrategy(strategyId));
  }

  function confirmPermanentDelete() {
    setConfirmForever(false);
    startTransition(() => permanentlyDeleteStrategyAction(strategyId));
  }

  return (
    <div className="flex items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
        {STATUS_LABEL[status]}
      </span>

      {status === "DELETED" ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => restoreStrategyAction(strategyId))}
            className="text-sm font-medium text-brand-primary hover:underline disabled:opacity-50"
          >
            Restore
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmForever(true)}
            className="text-sm text-brand-navy/40 hover:text-brand-sell disabled:opacity-50"
          >
            Delete forever
          </button>
        </>
      ) : (
        <>
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
        </>
      )}

      {liveBlock && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-semibold text-brand-navy">This strategy is trading live</p>
            <p className="mt-2 text-xs text-brand-navy/60">Stop it on the Live Trading page first, close any open position, then delete it. Nothing was deleted.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLiveBlock(false)} className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy">
                Close
              </button>
              <Link href="/app/live-trading" className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white">
                Live Trading
              </Link>
            </div>
          </div>
        </div>
      )}

      {confirmState !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            {confirmState === "loading" ? (
              <p className="text-sm text-brand-navy/60">Checking for live forward testing sessions…</p>
            ) : confirmState > 0 ? (
              <>
                <p className="text-sm font-semibold text-brand-navy">
                  {confirmState} live forward testing session{confirmState === 1 ? "" : "s"} on this strategy
                </p>
                <p className="mt-2 text-xs text-brand-navy/60">
                  Deleting this strategy removes it for good. {confirmState === 1 ? "That session" : "Those sessions"} will stop syncing
                  and move to history — all {confirmState === 1 ? "its" : "their"} trade history and P&L stay exactly as they are, and
                  your backtests are kept. This can&apos;t be undone.
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
                    Delete forever
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-brand-navy">Delete this strategy forever?</p>
                <p className="mt-2 text-xs text-brand-navy/60">
                  It is removed for good and can&apos;t be restored. Your past backtests and forward test history are kept. To keep it but out of the way, archive it instead.
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
                    Delete forever
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmForever && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-semibold text-brand-navy">Delete this strategy forever?</p>
            <p className="mt-2 text-xs text-brand-navy/60">
              This permanently removes the strategy and can&apos;t be undone — unlike Delete, there&apos;s no
              Restore after this. Its backtests and forward testing order history are kept separately and aren&apos;t
              affected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmForever(false)}
                className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPermanentDelete}
                className="rounded-full bg-brand-sell px-4 py-1.5 text-xs font-semibold text-white"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
