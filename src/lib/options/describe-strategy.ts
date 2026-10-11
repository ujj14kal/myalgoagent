import type { OptionStrategyInput } from "@/lib/option-strategy-actions";
import { STRATEGY_TEMPLATES, summarize, type Leg } from "./positions";

// A plain-English reading of an options strategy while it is being built: what it is called, what it bets on, how
// much it can win or lose (from the shape of its legs, not from prices), when it trades and what looks risky. Pure.

const EXPIRY = { WEEKLY_CURRENT: "the nearest expiry", WEEKLY_NEXT: "the next expiry", MONTHLY: "the monthly expiry" } as const;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type L = OptionStrategyInput["legs"][number];
const key = (l: Pick<L, "type" | "side" | "offset">) => `${l.type}.${l.side}.${l.offset}`;

/** The classic strategy these legs make (lots ignored), if any. */
export function matchTemplate(legs: L[]): { label: string; view: string } | null {
  const mine = legs.map(key).sort().join("|");
  const t = STRATEGY_TEMPLATES.find((x) => x.legs.map(key).sort().join("|") === mine);
  return t ? { label: t.label, view: t.view } : null;
}

export type StrategyReading = {
  title: string;
  outlook: string;
  /** What the shape allows, in words — risk and reward before any prices are known. */
  shape: { loss: "limited" | "unlimited"; profit: "limited" | "unlimited"; text: string };
  legs: string[];
  when: string;
  warnings: string[];
};

export function readStrategy(s: OptionStrategyInput): StrategyReading {
  const tpl = matchTemplate(s.legs);
  // Shape from the legs alone: strikes spaced one apart, every premium equal, one unit each.
  const legs: Leg[] = s.legs.map((l) => ({ kind: "OPTION", type: l.type, side: l.side, strike: 1000 + l.offset * 10, premium: 1, lots: l.lots, lotSize: 1, expiryDays: 7, iv: 0.15 }));
  const sum = legs.length ? summarize(legs) : null;
  const loss = !sum || sum.maxLoss === null ? "unlimited" : "limited";
  const profit = !sum || sum.maxProfit === null ? "unlimited" : "limited";
  const shortCall = s.legs.some((l) => l.side === "SELL" && l.type === "CE");
  const shortPut = s.legs.some((l) => l.side === "SELL" && l.type === "PE");
  const warnings: string[] = [];
  if (loss === "unlimited" && !s.stopLossUnit) warnings.push("These legs can lose without limit and there is no stop-loss. Add one so a bad day is cut off.");
  else if (loss === "unlimited") warnings.push("These legs can lose more than the premium. The stop-loss is what caps a bad day — it works on prices the engine checks, so a fast move can slip past it.");
  if (shortCall && shortPut && s.legs.every((l) => l.offset === 0 || Math.abs(l.offset) <= 1) && loss === "unlimited") warnings.push("Selling both sides close to the money earns the most when the market sits still and loses quickly in a big move.");
  if (s.legs.length === 0) warnings.push("Add at least one leg.");
  if (s.exitMinute - s.entryMinute < 15 && s.legs.length) warnings.push("Entry and square-off are only minutes apart.");
  if (s.stopLossUnit && s.targetUnit && s.stopLossUnit === s.targetUnit && s.stopLossValue && s.targetValue && s.targetValue < s.stopLossValue / 4) warnings.push("The target is far smaller than the stop-loss, so it needs a very high win rate to pay.");
  const bullets = s.legs.map((l) => `${l.side === "BUY" ? "Buy" : "Sell"} ${l.lots} lot${l.lots === 1 ? "" : "s"} of the ${l.offset === 0 ? "at-the-money" : `${Math.abs(l.offset)} strike${Math.abs(l.offset) === 1 ? "" : "s"} ${l.offset > 0 ? "above" : "below"}-the-money`} ${l.type === "CE" ? "call" : "put"}`.replace("above-the-money", "above the money").replace("below-the-money", "below the money"));
  const days = s.weekdays.length === 5 ? "every trading day" : s.weekdays.length ? s.weekdays.map((d) => DAY_NAMES[d - 1]).join(", ") : "no day yet";
  return {
    title: tpl?.label ?? (s.legs.length ? "Custom strategy" : "No legs yet"),
    outlook: tpl?.view ?? (s.legs.length ? "Your own combination" : ""),
    shape: {
      loss,
      profit,
      text: `${loss === "limited" ? "Loss limited" : "Loss not limited"} · ${profit === "limited" ? "profit limited" : "profit not limited"}`,
    },
    legs: bullets,
    when: `On ${EXPIRY[s.expiryRule]} of ${s.underlying || "the underlying"}, enters at ${clock(s.entryMinute)} and squares off at ${clock(s.exitMinute)}, ${days}.${s.stopLossUnit && s.stopLossValue ? ` Stop-loss ${s.stopLossUnit === "RUPEES" ? `₹${s.stopLossValue}` : `${s.stopLossValue}% of premium`}.` : ""}${s.targetUnit && s.targetValue ? ` Target ${s.targetUnit === "RUPEES" ? `₹${s.targetValue}` : `${s.targetValue}% of premium`}.` : ""}`,
    warnings,
  };
}
