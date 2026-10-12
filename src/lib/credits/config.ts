// What the metered features cost and what each plan allows. Pure, so the same rules run on the server (which enforces them)
// and in the browser (which shows the price before you press the button). Credit prices follow what each action really
// costs us (about ₹0.15–0.33 of cost per credit); see the pricing notes in the repo history for the working.

export type CreditPlan = "FREE" | "TRADE" | "PRO";
export const PLAN_ORDER: CreditPlan[] = ["FREE", "TRADE", "PRO"];

export type CreditAction = "ai_reply" | "ai_build" | "ai_voice" | "ai_speak" | "rule_code" | "backtest";

/** Credits per action (a backtest's price depends on its size: see backtestCost). */
export const ACTION_COST: Record<Exclude<CreditAction, "backtest">, number> = {
  ai_reply: 2, // a plain answer
  ai_build: 5, // a turn that prepares something (strategy, block, indicator, concept…)
  ai_voice: 6, // one spoken exchange: listening, answering, speaking
  ai_speak: 3, // reading an existing typed reply aloud
  rule_code: 3, // the code editor's "write it with the assistant"
};

export const ACTION_LABEL: Record<CreditAction, string> = {
  ai_reply: "AI reply",
  ai_build: "AI build",
  ai_voice: "Voice exchange",
  ai_speak: "Read aloud",
  rule_code: "AI rule writer",
  backtest: "Backtest",
};

/** Actions that are the AI (they count toward the free plan's lifetime AI replies and the AI daily caps). */
export const AI_ACTIONS: CreditAction[] = ["ai_reply", "ai_build", "ai_voice", "ai_speak", "rule_code"];

export type PlanSpec = {
  label: string;
  /** Rupees a month, GST included; null = free. */
  price: number | null;
  /** Credits added each period. */
  monthlyCredits: number;
  /** Free plan only: AI replies for the whole life of the account. Null = not limited this way. */
  aiLifetimeReplies: number | null;
  /** Whether voice (listening, speaking) is on this plan. */
  voice: boolean;
  /** Whether backtests that cost more than one credit (intraday, long history) are allowed. */
  bigBacktests: boolean;
  /** Per-day ceilings, whatever the balance: AI replies (all kinds), builds, voice exchanges. */
  daily: { ai: number; build: number; voice: number };
};

export const PLANS: Record<CreditPlan, PlanSpec> = {
  FREE: { label: "Free", price: null, monthlyCredits: 20, aiLifetimeReplies: 2, voice: false, bigBacktests: false, daily: { ai: 2, build: 2, voice: 0 } },
  TRADE: { label: "Trade", price: 1999, monthlyCredits: 1500, aiLifetimeReplies: null, voice: true, bigBacktests: true, daily: { ai: 40, build: 15, voice: 40 } },
  PRO: { label: "Pro", price: 3499, monthlyCredits: 4000, aiLifetimeReplies: null, voice: true, bigBacktests: true, daily: { ai: 100, build: 40, voice: 120 } },
};

/** Top-up packs (paid plans): priced for at least a 54% margin even if every credit is spent at the worst-case cost. Rupees, GST included. */
export const TOPUP_PACKS = [
  { credits: 250, price: 299 },
  { credits: 750, price: 799 },
  { credits: 2000, price: 1799 },
  { credits: 5000, price: 3999 },
] as const;

const INTRADAY = new Set(["1m", "2m", "3m", "5m", "15m", "30m", "60m", "4h"]);
const LONG_RANGE = new Set(["5y", "max"]);

/** What one backtest costs: 1 for daily candles up to a year; 2 for intraday or a long history; 3 for both. */
export function backtestCost(o: { timeframe: string; range: string }): number {
  const intraday = INTRADAY.has(o.timeframe);
  const long = LONG_RANGE.has(o.range) || (intraday && (o.range === "1y" || LONG_RANGE.has(o.range)));
  if (intraday && long) return 3;
  return intraday || LONG_RANGE.has(o.range) ? 2 : 1;
}

export type Balance = { monthly: number; topup: number };
export const totalOf = (b: Balance) => b.monthly + b.topup;

/** Spending takes the plan's monthly credits first and the top-up credits after. */
export function splitSpend(b: Balance, cost: number): Balance | null {
  if (cost < 0 || totalOf(b) < cost) return null;
  const fromMonthly = Math.min(b.monthly, cost);
  return { monthly: b.monthly - fromMonthly, topup: b.topup - (cost - fromMonthly) };
}

export type Usage = { aiToday: number; buildsToday: number; voiceToday: number; aiRepliesEver: number };

export type Refusal = { code: "NO_CREDITS" | "DAILY_CAP" | "FREE_AI_USED" | "NOT_ON_PLAN"; message: string };

/**
 * May this account do this now? `cost` is the price (for a backtest, from backtestCost). Returns why not, in plain words, or null.
 * The free plan trades credits for a short list of allowances; paid plans spend credits under daily ceilings.
 */
export function refusalFor(plan: CreditPlan, balance: Balance, usage: Usage, action: CreditAction, cost: number): Refusal | null {
  const spec = PLANS[plan];
  const upgrade = plan === "FREE" ? "Trade and Pro" : "Pro";
  const isAi = AI_ACTIONS.includes(action);
  if ((action === "ai_voice" || action === "ai_speak") && !spec.voice) return { code: "NOT_ON_PLAN", message: "Voice is part of the Trade and Pro plans." };
  if (action === "backtest" && cost > 1 && !spec.bigBacktests) return { code: "NOT_ON_PLAN", message: "Intraday and long-history backtests are part of the Trade and Pro plans. On Free, daily candles up to a year work." };
  if (isAi && spec.aiLifetimeReplies !== null) {
    if (usage.aiRepliesEver >= spec.aiLifetimeReplies) return { code: "FREE_AI_USED", message: `You've used your ${spec.aiLifetimeReplies} free AI replies. ${upgrade} include the AI every month.` };
    return null; // free AI replies are counted, not charged in credits
  }
  if (isAi) {
    if (usage.aiToday >= spec.daily.ai) return { code: "DAILY_CAP", message: `You've reached today's limit of ${spec.daily.ai} AI replies on ${spec.label}. It resets at midnight IST.` };
    if (action === "ai_build" && usage.buildsToday >= spec.daily.build) return { code: "DAILY_CAP", message: `You've reached today's limit of ${spec.daily.build} builds on ${spec.label}. It resets at midnight IST.` };
    if ((action === "ai_voice" || action === "ai_speak") && usage.voiceToday >= spec.daily.voice) return { code: "DAILY_CAP", message: `You've reached today's voice limit on ${spec.label}. It resets at midnight IST.` };
  }
  if (totalOf(balance) < cost) {
    return { code: "NO_CREDITS", message: `This needs ${cost} credit${cost === 1 ? "" : "s"} and you have ${totalOf(balance)}. ${plan === "FREE" ? "Trade and Pro come with more every month." : "Top up, or wait for your credits to renew."}` };
  }
  return null;
}

/** The credits an action will take, for showing before it is done. */
export function priceOf(action: CreditAction, opts?: { timeframe?: string; range?: string }): number {
  return action === "backtest" ? backtestCost({ timeframe: opts?.timeframe ?? "1d", range: opts?.range ?? "1y" }) : ACTION_COST[action];
}
