import type { OptionStrategyInput } from "@/lib/option-strategy-actions";
import type { ExpiryRule, StrategyLeg } from "@/lib/options/backtest-engine";
import type { OptionLeg } from "@/lib/options/positions";

// Turns the contracts picked in the Options Lab into a saved options strategy: each leg's strike becomes "N strikes from
// the at-the-money strike" (so the strategy re-picks live strikes every day it trades), and the chosen expiry becomes an
// expiry rule. Everything else (entry and exit time, days, stop-loss, target) is set in the same editor used everywhere.

const MAX_OFFSET = 10;

/** The strategy these legs describe, plus anything that couldn't be carried over exactly. */
export function strategyFromLegs(args: { legs: OptionLeg[]; underlying: string; step: number; atm: number; expiries: string[]; expiry: string | null }): { input: OptionStrategyInput; notes: string[]; /** Legs further than the strategy can hold from the at-the-money strike. */ tooFar: number[] } {
  const { legs, step, atm } = args;
  const notes: string[] = [];
  const tooFar: number[] = [];
  const mapped: StrategyLeg[] = legs.slice(0, 6).map((l) => {
    const raw = step > 0 ? (l.strike - atm) / step : 0;
    const offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(raw)));
    if (Math.abs(raw - Math.round(raw)) > 0.01) notes.push(`${l.strike} isn't on the ${step}-point strike grid; it is saved as the nearest strike.`);
    if (Math.abs(Math.round(raw)) > MAX_OFFSET) tooFar.push(l.strike);
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
    tooFar,
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

// ---------- the strategy in a link ----------
// The Options Lab hands what it built to the full-page strategy editor through the address, so nothing is saved until the
// user presses Save there. Legs travel as "CE.SELL.0.1" (type, side, strikes from at-the-money, lots).

const RULES: ExpiryRule[] = ["WEEKLY_CURRENT", "WEEKLY_NEXT", "MONTHLY"];

export function strategyToQuery(i: OptionStrategyInput): string {
  const q = new URLSearchParams({
    name: i.name,
    u: i.underlying,
    legs: i.legs.map((l) => `${l.type}.${l.side}.${l.offset}.${l.lots}`).join(","),
    exp: i.expiryRule,
    in: String(i.entryMinute),
    out: String(i.exitMinute),
    days: i.weekdays.join(""),
  });
  if (i.stopLossUnit && i.stopLossValue) q.set("sl", `${i.stopLossUnit}.${i.stopLossValue}`);
  if (i.targetUnit && i.targetValue) q.set("tp", `${i.targetUnit}.${i.targetValue}`);
  return q.toString();
}

/** Reads a strategy back from link parameters; anything missing or malformed falls back to the defaults given. */
export function strategyFromQuery(sp: Record<string, string | string[] | undefined>, base: OptionStrategyInput): OptionStrategyInput {
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const legs = (one("legs") ?? "")
    .split(",")
    .map((x) => x.split("."))
    .flatMap(([type, side, off, lots]) => {
      const offset = Number(off);
      const n = Number(lots);
      return (type === "CE" || type === "PE") && (side === "BUY" || side === "SELL") && Number.isInteger(offset) && Math.abs(offset) <= 20 && Number.isInteger(n) && n >= 1 && n <= 50 ? [{ type, side, offset, lots: n } as StrategyLeg] : [];
    })
    .slice(0, 6);
  const num = (k: string) => (Number.isInteger(Number(one(k))) && one(k) ? Number(one(k)) : null);
  const risk = (k: string) => {
    const [unit, value] = (one(k) ?? "").split(".").length > 1 ? [(one(k) ?? "").split(".")[0], Number((one(k) ?? "").split(".").slice(1).join("."))] : [null, null];
    return (unit === "RUPEES" || unit === "PREMIUM_PCT") && value && value > 0 ? ({ unit, value } as { unit: "RUPEES" | "PREMIUM_PCT"; value: number }) : null;
  };
  const days = (one("days") ?? "").split("").map(Number).filter((d) => d >= 1 && d <= 5);
  const sl = risk("sl");
  const tp = risk("tp");
  return {
    ...base,
    name: (one("name") ?? base.name).slice(0, 80),
    underlying: /^[A-Z0-9&-]{2,20}$/.test((one("u") ?? "").toUpperCase()) ? (one("u") as string).toUpperCase() : base.underlying,
    legs: legs.length ? legs : base.legs,
    expiryRule: RULES.includes(one("exp") as ExpiryRule) ? (one("exp") as ExpiryRule) : base.expiryRule,
    entryMinute: num("in") ?? base.entryMinute,
    exitMinute: num("out") ?? base.exitMinute,
    weekdays: days.length ? [...new Set(days)] : base.weekdays,
    stopLossUnit: sl ? sl.unit : base.stopLossUnit,
    stopLossValue: sl ? sl.value : base.stopLossValue,
    targetUnit: tp ? tp.unit : base.targetUnit,
    targetValue: tp ? tp.value : base.targetValue,
  };
}
