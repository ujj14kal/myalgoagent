import type { Candle } from "@/lib/market-data";
import { istDayAndMinute } from "@/lib/market-data/resample";
import { stepBar, type EngineConfig, type EngineState, type StepResult, type StrategyDirection } from "./step";

// A trading system runs several concepts at once — bullish ones that open longs, bearish ones that open shorts (or
// only close longs, when shorting isn't allowed). The concepts only say "setup valid"; this layer decides what to do,
// one candle at a time, then hands the candle to the ordinary engine (stepBar) with the right direction:
//
//  Flat + one side valid      → open that side (if the system's sessions allow an entry now).
//  Flat + both sides valid    → the conflict rule: bullish / bearish priority, the first one to become valid, the
//                               higher-timeframe one, the more confident one, ignore both, or wait until one side
//                               has stayed valid on its own for N candles.
//  Long + bearish setup       → ignore / exit / exit and reverse to short (short + bullish: the mirror), optionally
//                               only once the opposite setup has held for N candles (wait for confirmation).
//  Same-side setup in a trade → an add, when the system allows several entries per position.
//
// Stops, targets, trailing, multi-target exits, square-off and the system limits all stay in stepBar, unchanged.

export interface SystemRules {
  conflict: { rule: "BULLISH" | "BEARISH" | "FIRST" | "HIGHER_TIMEFRAME" | "CONFIDENCE" | "IGNORE" | "WAIT"; confirmBars: number };
  opposite: { whenLong: "IGNORE" | "EXIT" | "REVERSE"; whenShort: "IGNORE" | "EXIT" | "REVERSE"; confirmBars: number };
  allowShort: boolean;
  entryWindows: { startMinute: number; endMinute: number }[];
  noTradeWindows: { startMinute: number; endMinute: number }[];
}

/**
 * One candle's view of the concepts. `bull`/`bear`: a setup of that side BECAME valid on this candle (what opens a
 * position — like a strategy's entry rule, it fires once, not on every candle it stays true). `bullValid`/`bearValid`:
 * a setup of that side IS valid now (what conflicts, confirmation waits and opposite-setup exits look at).
 */
export interface SystemSignals {
  bull: boolean;
  bear: boolean;
  bullValid: boolean;
  bearValid: boolean;
  /** An exit-only concept is valid now: a bearish one closes longs, a bullish one closes shorts (never opens anything). */
  bullExit?: boolean;
  bearExit?: boolean;
  bullConfidence: number;
  bearConfidence: number;
  bullRank: number;
  bearRank: number;
  /** The candle index where the current run of valid bars began (null when not valid). */
  bullSince: number | null;
  bearSince: number | null;
}

export interface SystemState {
  engine: EngineState;
  /** The open (or resting) position's side; null when flat. */
  side: StrategyDirection | null;
  /** Candles the opposite setup has been valid while in a position. */
  oppositeRun: number;
  /** After an unresolved conflict (WAIT): the side waiting to be confirmed and for how many candles it has held alone. */
  waiting: { side: StrategyDirection | null; run: number } | null;
}

export type SystemStepResult = StepResult & {
  system: SystemState;
  /** The side of the trade this candle closed, if it closed one. */
  tradeSide?: StrategyDirection;
  /** Why the position closed when a concept closed it. */
  systemExit?: "opposite_signal" | "reversal";
  /** Set when an entry decision was made on this candle (filled at the next candle's open). */
  opened?: StrategyDirection;
  /** A conflict between bullish and bearish setups on this candle, and what the rule decided. */
  conflict?: "LONG" | "SHORT" | "NONE" | "WAITING";
};

export const startSystem = (cash: number): SystemState => ({ engine: { cash, position: null }, side: null, oppositeRun: 0, waiting: null });

/** May a new position be opened on a candle signalled at `bar` (filled at the next candle)? Sessions decide. */
export function entryTimeAllowed(rules: Pick<SystemRules, "entryWindows" | "noTradeWindows">, fillBar: Candle | undefined): boolean {
  if (!fillBar) return false;
  const m = istDayAndMinute(fillBar.time).minute;
  if (rules.noTradeWindows.some((w) => m >= w.startMinute && m < w.endMinute)) return false;
  return rules.entryWindows.length === 0 || rules.entryWindows.some((w) => m >= w.startMinute && m < w.endMinute);
}

/** Flat: which side to open, if any, and the conflict outcome. Updates the WAIT memory. */
function chooseSide(sig: SystemSignals, rules: SystemRules, waiting: SystemState["waiting"]): { side: StrategyDirection | null; waiting: SystemState["waiting"]; conflict?: SystemStepResult["conflict"] } {
  const bullNow = sig.bullValid;
  const bearNow = sig.bearValid && rules.allowShort;
  if (waiting) {
    // An earlier conflict is waiting for one side to stay valid on its own.
    const alone: StrategyDirection | null = bullNow && !bearNow ? "LONG" : bearNow && !bullNow ? "SHORT" : null;
    if (!alone) return { side: null, waiting: bullNow || bearNow ? { side: null, run: 0 } : null, conflict: bullNow && bearNow ? "WAITING" : undefined };
    const run = waiting.side === alone ? waiting.run + 1 : 1;
    if (run >= Math.max(1, rules.conflict.confirmBars)) return { side: alone, waiting: null, conflict: "WAITING" };
    return { side: null, waiting: { side: alone, run }, conflict: "WAITING" };
  }
  // A new setup on this candle; it conflicts when the other side is valid at the same time.
  const bull = sig.bull;
  const bear = sig.bear && rules.allowShort;
  if (!bull && !bear) return { side: null, waiting: null };
  const conflict = (bull && bearNow) || (bear && bullNow);
  if (!conflict) return { side: bull ? "LONG" : "SHORT", waiting: null };
  const pick = (s: StrategyDirection | null) => ({ side: s, waiting: null, conflict: (s ?? "NONE") as SystemStepResult["conflict"] });
  switch (rules.conflict.rule) {
    case "BULLISH":
      return pick("LONG");
    case "BEARISH":
      return pick("SHORT");
    case "FIRST":
      return pick(sig.bullSince === sig.bearSince ? null : (sig.bullSince ?? Infinity) < (sig.bearSince ?? Infinity) ? "LONG" : "SHORT");
    case "HIGHER_TIMEFRAME":
      return pick(sig.bullRank === sig.bearRank ? null : sig.bullRank > sig.bearRank ? "LONG" : "SHORT");
    case "CONFIDENCE":
      return pick(sig.bullConfidence === sig.bearConfidence ? null : sig.bullConfidence > sig.bearConfidence ? "LONG" : "SHORT");
    case "WAIT":
      return { side: null, waiting: { side: null, run: 0 }, conflict: "WAITING" };
    default:
      return pick(null);
  }
}

/** One candle of a trading system. `allowEntries` false: manage what's open (exits, stops) but open nothing new. */
export function stepSystemBar(candles: Candle[], i: number, sig: SystemSignals, state: SystemState, config: EngineConfig, rules: SystemRules, allowEntries = true): SystemStepResult {
  const cfg = (side: StrategyDirection): EngineConfig => ({ ...config, direction: side });
  const canEnter = allowEntries && entryTimeAllowed(rules, candles[i + 1]);
  const engine = state.engine;

  // In a position (or a resting entry): the opposite setup may close or reverse it; the same side may add to it.
  if (state.side && (engine.position || engine.pendingEntry)) {
    const side = state.side;
    const opposite = side === "LONG" ? sig.bearValid : sig.bullValid;
    const exitOnly = side === "LONG" ? !!sig.bearExit : !!sig.bullExit;
    const same = side === "LONG" ? sig.bull : sig.bear;
    const baseAction = side === "LONG" ? rules.opposite.whenLong : rules.opposite.whenShort;
    const run = opposite ? state.oppositeRun + 1 : 0;
    // The other side's setup acts after its confirmation wait; an exit-only concept just closes the position (it
    // has already held for its own entry wait), and never reverses.
    const oppositeActs = opposite && baseAction !== "IGNORE" && run > rules.opposite.confirmBars;
    const action = oppositeActs ? baseAction : "EXIT";
    const acts = !!engine.position && (oppositeActs || exitOnly);
    const r = stepBar(candles, i, same && canEnter, acts, engine, cfg(side));
    const closed = !!r.trade && !r.state.position;
    if (!closed) {
      return { ...r, system: { ...state, engine: r.state, side: r.state.position || r.state.pendingEntry ? side : null, oppositeRun: run }, ...(r.trade ? { tradeSide: side } : {}) };
    }
    const byConcept = r.exitReason === "exit_rule";
    const reverseTo: StrategyDirection = side === "LONG" ? "SHORT" : "LONG";
    const reversing = byConcept && action === "REVERSE" && (reverseTo === "LONG" || rules.allowShort) && canEnter;
    if (!reversing) {
      return { ...r, ...(byConcept ? { exitReason: undefined, systemExit: "opposite_signal" as const } : {}), tradeSide: side, system: { ...state, engine: r.state, side: null, oppositeRun: 0, waiting: null } };
    }
    // Exit and reverse: the opposite position opens at the same next-candle open the exit fills at.
    const flat: EngineState = { ...r.state, position: null, pendingEntry: null };
    const opened = stepBar(candles, i, true, false, flat, cfg(reverseTo));
    const nowOpen = !!(opened.state.position || opened.state.pendingEntry);
    return {
      ...r,
      exitReason: undefined,
      systemExit: "reversal",
      tradeSide: side,
      ...(nowOpen ? { opened: reverseTo } : {}),
      ...(opened.sizeTooSmall ? { sizeTooSmall: true } : {}),
      ...(opened.blockedBy ? { blockedBy: opened.blockedBy } : {}),
      state: opened.state,
      system: { engine: opened.state, side: nowOpen ? reverseTo : null, oppositeRun: 0, waiting: null },
    };
  }

  // Flat: choose a side by the conflict rule, then let the engine open it (sessions permitting).
  const choice = chooseSide(sig, rules, state.waiting);
  const side = canEnter ? choice.side : null;
  const r = stepBar(candles, i, side !== null, false, engine, cfg(side ?? state.side ?? "LONG"));
  const nowOpen = !!(r.state.position || r.state.pendingEntry);
  return {
    ...r,
    ...(side && nowOpen ? { opened: side } : {}),
    ...(choice.conflict ? { conflict: choice.conflict } : {}),
    system: { engine: r.state, side: nowOpen ? side : null, oppositeRun: 0, waiting: choice.waiting },
  };
}

/** Per-candle signals from each concept's validity and optional-block series. */
export function systemSignals(
  concepts: {
    side: "BULLISH" | "BEARISH";
    valid: (boolean | undefined)[];
    optionals: (boolean | undefined)[][];
    timeframeRank: number;
    /** How the entry is considered (default: once, when the setup becomes valid). */
    entry?: { trigger: "FORMED" | "WHILE_VALID"; confirmBars: number };
    role?: "ENTRY" | "EXIT";
  }[],
  length: number,
): SystemSignals[] {
  const out: SystemSignals[] = [];
  let bullSince: number | null = null;
  let bearSince: number | null = null;
  // Each concept's own run of valid candles, so its entry trigger and confirmation wait can be applied per concept.
  const runs = concepts.map(() => 0);
  for (let i = 0; i < length; i++) {
    let bull = false;
    let bear = false;
    let bullFire = false;
    let bearFire = false;
    let bullExit = false;
    let bearExit = false;
    let bullConfidence = 0;
    let bearConfidence = 0;
    let bullRank = -1;
    let bearRank = -1;
    for (const [k, c] of concepts.entries()) {
      runs[k] = c.valid[i] ? runs[k] + 1 : 0;
      if (!c.valid[i]) continue;
      const hold = Math.max(0, c.entry?.confirmBars ?? 0);
      const ready = runs[k] >= hold + 1; // held long enough to count
      if (c.role === "EXIT") {
        if (ready) (c.side === "BULLISH" ? (bullExit = true) : (bearExit = true));
        continue;
      }
      const fires = c.entry?.trigger === "WHILE_VALID" ? ready : runs[k] === hold + 1;
      if (!ready) continue;
      // Confidence: the share of the concept's optional blocks present now (a concept without optional blocks: 1).
      const confidence = c.optionals.length ? c.optionals.filter((o) => o[i]).length / c.optionals.length : 1;
      if (c.side === "BULLISH") {
        bull = true;
        bullFire = bullFire || fires;
        bullConfidence = Math.max(bullConfidence, confidence);
        bullRank = Math.max(bullRank, c.timeframeRank);
      } else {
        bear = true;
        bearFire = bearFire || fires;
        bearConfidence = Math.max(bearConfidence, confidence);
        bearRank = Math.max(bearRank, c.timeframeRank);
      }
    }
    bullSince = bull ? (bullSince ?? i) : null;
    bearSince = bear ? (bearSince ?? i) : null;
    out.push({ bull: bullFire, bear: bearFire, bullValid: bull, bearValid: bear, bullExit, bearExit, bullConfidence, bearConfidence, bullRank, bearRank, bullSince, bearSince });
  }
  return out;
}
