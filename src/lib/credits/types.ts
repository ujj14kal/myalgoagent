import type { CreditPlan } from "./config";

/** What the live meter shows. Plain data, so a server action can hand it to the browser with each result. */
export type CreditSnapshot = {
  plan: CreditPlan;
  planLabel: string;
  /** While the account is on its first-week trial: when it ends (ISO). Null otherwise. */
  trial: { endsAt: string } | null;
  /** Credits left from the plan's monthly allowance, and what it started the period with. */
  monthly: number;
  monthlyOf: number;
  topup: number;
  total: number;
  /** When the monthly credits renew (ISO). */
  periodEnd: string;
  /** Free plan: AI replies still available for the life of the account (null on paid plans). */
  aiRepliesLeft: number | null;
  /** Today's use against the daily ceilings (IST day). */
  today: { ai: { used: number; cap: number }; builds: { used: number; cap: number }; voice: { used: number; cap: number } };
  /** When this was read (ISO) — the newer snapshot wins when two arrive out of order. */
  at: string;
};

export type CreditEventRow = { id: string; kind: string; action: string | null; credits: number; monthlyAfter: number; topupAfter: number; createdAt: string };
