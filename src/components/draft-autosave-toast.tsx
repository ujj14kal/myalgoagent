"use client";

/** A passive, non-blocking notification — it informs, it never asks for a
 * decision. The strategy is already saved as a draft by the time this
 * renders; navigation proceeds on its own a moment later regardless of
 * whether the user does anything here. The only interactive part is the
 * optional "don't remind me" checkbox, which affects future navigations,
 * not this one. */
export default function DraftAutoSaveToast({
  dontRemind,
  onDontRemindChange,
  onDismiss,
}: {
  dontRemind: boolean;
  onDontRemindChange: (checked: boolean) => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[60] w-full max-w-sm rounded-2xl border border-black/5 bg-white p-4 shadow-xl sm:right-6 sm:top-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-navy">Saved as draft</p>
          <p className="mt-0.5 text-xs text-brand-navy/60">
            You left before finishing, so this strategy was saved to Drafts automatically. Pick it back up anytime
            from Strategies.
          </p>
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-brand-navy/50">
            <input
              type="checkbox"
              checked={dontRemind}
              onChange={(e) => onDontRemindChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-brand-navy/25 text-brand-primary focus:ring-brand-primary/40"
            />
            Don&apos;t remind me for the next 5 strategies
          </label>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-brand-navy/30 hover:text-brand-navy/60"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
