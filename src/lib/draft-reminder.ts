// Per-browser (not per-account — this is a lightweight UI nicety, not
// something worth a DB column/migration for) counter for how many more
// times the "saved as draft" toast should stay silent after the user
// checks "Don't remind me for the next 5 strategies". The auto-save
// itself never depends on this — it always runs; this only ever
// suppresses the notification about it.
const KEY = "maa_draft_reminder_skip_count";

export function getDraftReminderSkipCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setDraftReminderSkipCount(n: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(n));
}

/** Called once per navigate-away-while-dirty event. Returns whether the
 * toast should be shown this time. */
export function consumeDraftReminderSkip(): boolean {
  const count = getDraftReminderSkipCount();
  if (count <= 0) return true;
  setDraftReminderSkipCount(count - 1);
  return false;
}
