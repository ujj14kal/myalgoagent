// Which events may send an email, and the user's say in it. Pure, so the rules are tested and shared with the settings screen.

export type EventKind = "live_signal" | "live_order" | "live_paused" | "broker_session" | "credits_low" | "credits_out" | "plan_changed";

export type EventInfo = {
  label: string;
  description: string;
  /** Safety-critical: always sent (like risk alerts in the app), never switchable. */
  alwaysOn: boolean;
  /** At most `max` emails of this kind per `windowMs` for one user, so a busy market can't flood an inbox. */
  max: number;
  windowMs: number;
};

const MIN = 60_000;

export const EVENT_INFO: Record<EventKind, EventInfo> = {
  live_signal: { label: "A live signal is waiting for you", description: "A strategy in confirm-first mode has an order ready and is waiting for your OK.", alwaysOn: false, max: 6, windowMs: 60 * MIN },
  live_order: { label: "A live order was filled", description: "A real order placed by one of your live strategies went through at your broker.", alwaysOn: false, max: 10, windowMs: 60 * MIN },
  live_paused: { label: "A live strategy was paused", description: "An order was rejected or a risk limit stopped a live strategy.", alwaysOn: true, max: 6, windowMs: 60 * MIN },
  broker_session: { label: "Your broker login needs attention", description: "A broker session ended or is about to end, so live prices and orders stop until you sign in.", alwaysOn: true, max: 2, windowMs: 24 * 60 * MIN },
  credits_low: { label: "Credits are running low", description: "Your credits are almost used up for this month.", alwaysOn: false, max: 1, windowMs: 24 * 60 * MIN },
  credits_out: { label: "You are out of credits", description: "The AI assistant and backtests pause until your credits renew or you top up.", alwaysOn: false, max: 1, windowMs: 24 * 60 * MIN },
  plan_changed: { label: "Your plan changed", description: "A confirmation when your plan is changed.", alwaysOn: false, max: 5, windowMs: 60 * MIN },
};

export const EVENT_KINDS = Object.keys(EVENT_INFO) as EventKind[];

export type EmailPrefs = Partial<Record<EventKind, boolean>>;

/** The stored prefs, kept only for events a user may switch (anything else in the JSON is ignored). */
export function cleanPrefs(raw: unknown): EmailPrefs {
  const out: EmailPrefs = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of EVENT_KINDS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "boolean" && !EVENT_INFO[k].alwaysOn) out[k] = v;
    }
  }
  return out;
}

/** Whether this event's email should go to this user. Safety-critical events ignore the setting. */
export function wantsEmail(raw: unknown, kind: EventKind): boolean {
  if (EVENT_INFO[kind].alwaysOn) return true;
  return cleanPrefs(raw)[kind] !== false;
}

/** Credits: when a spend takes the balance across a threshold, which warning (if any) to send. */
export function creditWarning(before: number, after: number, monthlyOf: number): "credits_out" | "credits_low" | null {
  if (before > 0 && after <= 0) return "credits_out";
  const low = Math.max(10, Math.floor(monthlyOf * 0.1));
  if (before > low && after <= low && after > 0) return "credits_low";
  return null;
}
