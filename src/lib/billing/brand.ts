// How MyAlgoAgent shows up inside Razorpay's payment window (and on receipts): our name, logo and colour, never theirs.
export const BRAND = {
  name: "MyAlgoAgent",
  /** Square logo, served from our own domain (Razorpay loads it into the payment window). */
  logoUrl: "https://myalgoagent.com/icon-512.png",
  /** The brand purple used across the site and app. */
  color: "#471898",
} as const;

export type PaidPlan = "TRADE" | "PRO";
export const PAID_PLANS: PaidPlan[] = ["TRADE", "PRO"];

/** What each plan is called in Razorpay, and the environment variable holding its Razorpay plan id (made by scripts/razorpay-setup.ts). */
export const RAZORPAY_PLAN_NAME: Record<PaidPlan, string> = { TRADE: "MyAlgoAgent Trade (monthly)", PRO: "MyAlgoAgent Pro (monthly)" };
export const RAZORPAY_PLAN_ENV: Record<PaidPlan, string> = { TRADE: "RAZORPAY_PLAN_TRADE", PRO: "RAZORPAY_PLAN_PRO" };
/** How many monthly charges one autopay mandate covers (10 years); the customer can cancel any time. */
export const SUBSCRIPTION_CYCLES = 120;
