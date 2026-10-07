import type { OptionStrategyInput } from "@/lib/option-strategy-actions";
import type { ExpiryRule, StrategyLeg } from "@/lib/options/backtest-engine";
import type { OptionLeg } from "@/lib/options/positions";

// Turns the contracts picked in the Options Lab into a saved options strategy: each leg's strike becomes "N strikes from
// the at-the-money strike" (so the strategy re-picks live strikes every day it trades), and the chosen expiry becomes an
// expiry rule. Everything else (entry and exit time, days, stop-loss, target) is set in the same editor used everywhere.

const MAX_OFFSET = 10;

/** The strategy these legs describe, plus anything that couldn't be carried over exactly. */
export function strategyFromLegs(args: { legs: OptionLeg[]; underlying: string; step: number; atm: number; expiries: string[]; expiry: string | null }): { input: OptionStrategyInput; notes: string[] } {
  const { legs, step, atm } = args;
  const notes: string[] = [];
  const mapped: StrategyLeg[] = legs.slice(0, 6).map((l) => {
    const raw = step > 0 ? (l.strike - atm) / step : 0;
    const offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(raw)));
    if (Math.abs(raw - Math.round(raw)) > 0.01) notes.push(`${l.strike} isn't on the ${step}-point strike grid; it is saved as the nearest strike.`);
    if (Math.abs(Math.round(raw)) > MAX_OFFSET) notes.push(`${l.strike} is more than ${MAX_OFFSET} strikes from the at-the-money strike; it is saved at ${MAX_OFFSET} strikes.`);
    return { type: l.type, side: l.side, offset, lots: Math.max(1, Math.min(50, Math.round(l.lots))) };
  });
  if (legs.length > 6) notes.push("A strategy can have up to 6 legs; only the first 6 are kept.");
  // The chosen expiry as a rule: the nearest, the next, or the month's last.
  const idx = args.expiry ? args.expiries.indexOf(args.expiry) : 0;
  const monthOf = (e: string) => e.slice(0, 7);
  const lastOfMonth = args.expiry ? args.expiries.filter((e) => monthOf(e) === monthOf(args.expiry!)).at(-1) === args.expiry : false;
  const expiryRule: ExpiryRule = idx <= 0 ? "WEEKLY_CURRENT" : idx === 1 && !lastOfMonth ? "WEEKLY_NEXT" : lastOfMonth ? "MONTHLY" : "WEEKLY_NEXT";
  const name = `${args.underlying} ${mapped.map((l) => `${l.side === "BUY" ? "long" : "short"} ${l.offset === 0 ? "ATM" : l.offset > 0 ? `+${l.offset}` : l.offset} ${l.type}`).join(" / ")}`.slice(0, 80);
  return {
    notes,
    input: {
      name,
      underlying: args.underlying.toUpperCase(),
      legs: mapped,
      expiryRule,
      entryMinute: 9 * 60 + 20,
      exitMinute: 15 * 60 + 15,
      weekdays: [1, 2, 3, 4, 5],
      stopLossUnit: null,
      stopLossValue: null,
      targetUnit: null,
      targetValue: null,
    },
  };
}
