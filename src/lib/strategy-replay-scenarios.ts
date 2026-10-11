import type { Candle } from "@/lib/market-data";
import type { PreviewTrade, StrategyPreview } from "@/lib/strategy-preview";
import type { ReplayCheck } from "@/lib/strategy-replay";
import { entryLevelPrice, lockFloor, targetPrice } from "@/lib/trading-engine/step";

// Turns a strategy demo into the replay's scenarios: one real trade for each
// way a trade ended (take-profit, stop-loss, trailing stop, exit rule…), and —
// when the user set a take-profit / stop-loss / trailing stop that never
// triggered on the real data — an illustration of it: the real chart up to a
// real entry, then a made-up price path, run through the engine's exit order
// (trailing stop, then stop-loss, then take-profit) so it shows what the
// strategy's own settings would do. Illustrations are always labelled.
//
// "demo" mode (the builder's default) goes further: every take-profit, stop-loss
// and trailing-stop outcome is an illustration, even when it also happened for
// real, so the user sees a clean reference move from the moment the entry
// condition matches. Exit-rule and square-off outcomes stay real — inventing
// indicator values to fake an exit rule would mislead.

export type ScenarioKind = "target" | "stop_loss" | "trailing_stop" | "exit_rule" | "square_off" | "end_of_data" | "plan";

/** What the "Entries & targets" demo draws on top of the candles: level lines, and the fills as they happen. */
export type PlanLine = { price: number; label: string; tone: "entry" | "avg" | "tp" | "sl"; fromIdx: number; /** Where the line stops (null = to the latest candle). */ toIdx: number | null };
export type PlanFill = { idx: number; price: number; label: string; kind: "entry" | "exit" };
export type PlanOverlay = { lines: PlanLine[]; fills: PlanFill[]; /** The story in plain words, one line each. */ summary: string[] };

export type Scenario = {
  id: string;
  kind: ScenarioKind;
  /** The outcome it was built to show (an illustration can end differently — see `note`). */
  shows: ScenarioKind;
  illustration: boolean;
  candles: Candle[];
  /** Index in `candles` of the first bar that is made up (illustrations only). */
  syntheticFrom: number | null;
  /** Maps a bar in `candles` to the demo's full candle list (null for made-up bars). */
  sourceIdx: (number | null)[];
  signalIdx: number;
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number | null;
  target: number | null;
  trailing: (number | null)[] | null;
  checks: ReplayCheck[];
  pnlPct: number;
  entryReason: string;
  exitRuleReason?: string;
  note?: string;
  plan?: PlanOverlay;
  /** An illustration of an outcome that also happened for real in the period. */
  alsoReal?: boolean;
};

export const SCENARIO_TITLE: Record<ScenarioKind, string> = {
  target: "Take-profit hit",
  stop_loss: "Stop-loss hit",
  trailing_stop: "Trailing stop hit",
  exit_rule: "Exit rule met",
  square_off: "Intraday square-off",
  end_of_data: "Still open",
  plan: "Entries & targets",
};

const PRE_BARS = 30;
const POST_BARS = 6;
const round = (v: number) => Math.round(v * 100) / 100;

function realScenario(p: StrategyPreview, t: PreviewTrade): Scenario {
  const r = t.replay;
  const start = Math.max(0, r.signalIdx - PRE_BARS);
  const end = Math.min(p.candles.length - 1, r.exitIdx + POST_BARS);
  const kind = (t.exitReason ?? "exit_rule") as ScenarioKind;
  return {
    id: `real-${kind}-${t.entryTime}`,
    kind,
    shows: kind,
    illustration: false,
    candles: p.candles.slice(start, end + 1),
    syntheticFrom: null,
    sourceIdx: Array.from({ length: end - start + 1 }, (_, i) => start + i),
    signalIdx: r.signalIdx - start,
    entryIdx: r.entryIdx - start,
    exitIdx: r.exitIdx - start,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    stopLoss: r.stopLoss,
    target: r.target,
    trailing: r.trailing,
    checks: r.checks,
    pnlPct: t.netPnlPct,
    entryReason: t.entryReason,
    exitRuleReason: t.exitRuleReason,
  };
}

/** Deterministic noise, so an illustration looks the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function averageRange(candles: Candle[], end: number, n = 14): number {
  const from = Math.max(1, end - n + 1);
  let sum = 0;
  let k = 0;
  for (let i = from; i <= end; i++, k++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  }
  return k ? sum / k : candles[end].high - candles[end].low;
}

function distance(leg: { unit: string; value: number } | null, entry: number, atr: number): number | null {
  if (!leg) return null;
  return leg.unit === "PERCENT" ? (entry * leg.value) / 100 : leg.unit === "POINTS" ? leg.value : leg.value * atr;
}

/**
 * Profit path (in price distance, + = in the trade's favour) for each outcome,
 * shaped so the intended level is the one reached — the engine check below
 * still decides what actually closes the trade.
 */
function pathFor(shows: ScenarioKind, d: { sl: number | null; tp: number | null; tr: number | null }, rand: () => number, noise: number): number[] {
  const small = 0.25 * Math.min(d.sl ?? Infinity, d.tr ?? Infinity, d.tp ?? Infinity) * noise;
  const wobble = (scale: number) => (rand() - 0.5) * 2 * scale;
  // Enough bars that no single step is as big as the trailing stop's distance.
  const steps = (move: number) => Math.min(40, Math.max(8, Math.ceil(move / (0.4 * (d.tr ?? Infinity)))));
  const out: number[] = [];
  if (shows === "target" && d.tp) {
    const n = Math.max(12, steps(d.tp));
    for (let i = 1; i <= n; i++) out.push((d.tp * 1.04 * i) / n + (i < n ? wobble(small * 0.8) : 0));
  } else if (shows === "stop_loss" && d.sl) {
    const up = Math.min(0.2 * d.sl, d.tr ? 0.15 * d.tr : Infinity);
    for (let i = 1; i <= 3; i++) out.push((up * i) / 3 + wobble(small * 0.3));
    const n = 7;
    for (let i = 1; i <= n; i++) out.push(up - ((up + d.sl * 1.08) * i) / n + (i < n ? wobble(small * 0.4) : 0));
  } else if (shows === "trailing_stop" && d.tr) {
    const peak = d.tp ? Math.min(0.8 * d.tp, Math.max(2.2 * d.tr, 0.5 * d.tp)) : 2.5 * d.tr;
    const n = steps(peak);
    for (let i = 1; i <= n; i++) out.push((peak * i) / n + wobble(Math.min(small, 0.2 * d.tr)));
    for (let i = 1; i <= 5; i++) out.push(peak - (d.tr * 1.3 * i) / 5);
  }
  return out;
}

type Sim = { synthetic: Candle[]; trailing: number[]; kind: ScenarioKind; exitPrice: number };

/** Plays a made-up price path through the engine's exit checks: trailing stop, then stop-loss, then take-profit. */
function simulate(
  path: number[],
  o: { entryPrice: number; short: boolean; atr: number; t0: number; dt: number; vol: number; noise: number; seed: number },
  levels: { sl: number | null; tp: number | null; tr: number | null },
): Sim {
  const px = (u: number) => o.entryPrice + (o.short ? -u : u);
  const rand = rng(o.seed);
  const synthetic: Candle[] = [];
  const trailing: number[] = [];
  let extreme = o.entryPrice;
  let open = o.entryPrice;
  for (let i = 0; i < path.length; i++) {
    const close = px(path[i]);
    // Wicks stay well inside the trailing distance, so only the path decides the exit.
    const pad = Math.min(Math.abs(close - open) * 0.25 + o.atr * 0.12 * (0.5 + rand()) * o.noise, levels.tr !== null ? 0.2 * levels.tr : Infinity);
    const bar: Candle = { time: o.t0 + i * o.dt, open: round(open), close: round(close), high: round(Math.max(open, close) + pad), low: round(Math.min(open, close) - pad), volume: Math.round(o.vol * (0.7 + rand() * 0.6)) };
    synthetic.push(bar);
    extreme = o.short ? Math.min(extreme, bar.low) : Math.max(extreme, bar.high);
    const trail = levels.tr !== null ? round(o.short ? extreme + levels.tr : extreme - levels.tr) : null;
    if (trail !== null) trailing.push(trail);
    const against = (level: number) => (o.short ? bar.high >= level : bar.low <= level);
    const inFavour = (level: number) => (o.short ? bar.low <= level : bar.high >= level);
    const sl = levels.sl !== null ? round(px(-levels.sl)) : null;
    const tp = levels.tp !== null ? round(px(levels.tp)) : null;
    if (trail !== null && against(trail)) return { synthetic, trailing, kind: "trailing_stop", exitPrice: trail };
    if (sl !== null && against(sl)) return { synthetic, trailing, kind: "stop_loss", exitPrice: sl };
    if (tp !== null && inFavour(tp)) return { synthetic, trailing, kind: "target", exitPrice: tp };
    open = close;
  }
  return { synthetic, trailing, kind: "end_of_data", exitPrice: round(px(path.at(-1) ?? 0)) };
}

function illustration(p: StrategyPreview, base: PreviewTrade, shows: "target" | "stop_loss" | "trailing_stop"): Scenario | null {
  const r = base.replay;
  const entryPrice = base.entryPrice;
  const atr = averageRange(p.candles, r.signalIdx);
  const d = { sl: distance(p.risk.stopLoss, entryPrice, atr), tp: distance(p.risk.target, entryPrice, atr), tr: distance(p.risk.trailing, entryPrice, atr) };

  const short = p.direction === "SHORT";
  const start = Math.max(0, r.signalIdx - PRE_BARS);
  const real = p.candles.slice(start, r.entryIdx);
  const dt = p.candles.length > 1 ? p.candles[1].time - p.candles[0].time : 86_400;
  const t0 = p.candles[r.entryIdx]?.time ?? p.candles[p.candles.length - 1].time + dt;
  const vol = p.candles[r.signalIdx]?.volume ?? 0;
  const seed = Math.round(entryPrice * 100) + shows.length;

  // Natural-looking first; calmer paths if noise let another exit fire first.
  let sim: Sim | null = null;
  for (const noise of [1, 0.4, 0]) {
    const path = pathFor(shows, d, rng(seed), noise);
    if (path.length === 0) return null;
    sim = simulate(path, { entryPrice, short, atr, t0, dt, vol, noise, seed: seed + 7 }, d);
    if (sim.kind === shows) break;
  }
  const { synthetic, trailing, kind, exitPrice } = sim!;
  const px = (u: number) => entryPrice + (short ? -u : u);
  const sl = d.sl !== null ? round(px(-d.sl)) : null;
  const tp = d.tp !== null ? round(px(d.tp)) : null;

  const candles = [...real, ...synthetic];
  const entryIdx = real.length;
  const exitIdx = candles.length - 1;
  const sign = short ? -1 : 1;
  const note =
    kind !== shows && shows === "stop_loss" && kind === "trailing_stop"
      ? "Your trailing stop is tighter than your stop-loss, so it always closes a losing trade first — the stop-loss is a backstop."
      : kind !== shows
        ? `With these settings the ${SCENARIO_TITLE[kind].toLowerCase()} comes first.`
        : undefined;
  return {
    id: `illustration-${shows}`,
    kind,
    shows,
    illustration: true,
    candles,
    syntheticFrom: entryIdx,
    sourceIdx: candles.map((_, i) => (i < entryIdx ? start + i : null)),
    signalIdx: r.signalIdx - start,
    entryIdx,
    exitIdx,
    entryPrice,
    exitPrice,
    stopLoss: sl,
    target: tp,
    trailing: d.tr !== null ? trailing : null,
    checks: r.checks,
    pnlPct: round(((exitPrice - entryPrice) / entryPrice) * 100 * sign),
    entryReason: base.entryReason,
    note,
  };
}

const rupee = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const unitText = (unit: string, value: number) => (unit === "PERCENT" ? `${value}%` : unit === "POINTS" ? `${value} pts` : unit === "R_MULTIPLE" ? `${value}R` : `${value}× ATR`);

/**
 * The multi-level plan as a made-up price path from a real entry: the first entry, each further entry at its own level
 * (pullbacks fill on the way down, breakouts on the way up, a rule on the spot), the average price they make, the
 * staged targets one after another — each selling its share and moving the stop as its lock says — and the stop. Levels
 * measure from the first fill; stop and targets from the average price, exactly as the engine does. Always labelled.
 */
function planScenario(p: StrategyPreview, base: PreviewTrade): Scenario | null {
  const plan = p.plan.entryPlan;
  const staged = p.plan.targets;
  const levels = plan?.levels ?? [];
  if (!levels.length && !staged.length) return null;
  const r = base.replay;
  const short = p.direction === "SHORT";
  const sign = short ? -1 : 1;
  const E = base.entryPrice;
  const atr = averageRange(p.candles, r.signalIdx);
  const stopOf = (from: number) => {
    const d = distance(p.risk.stopLoss, from, atr);
    return d === null ? null : round(from - sign * d);
  };
  const rand = rng(Math.round(E * 100) + 11);

  // Steps of the path: a price to reach, whether something happens there, and the words for it.
  type Step = { price: number; fill?: { kind: "entry" | "exit"; label: string }; hold?: boolean };
  const steps: Step[] = [];
  const fills: { price: number; share: number }[] = [{ price: E, share: plan?.firstPercent ?? 100 }];
  const summary: string[] = [`Entry 1 at ${rupee(E)}: ${plan?.firstPercent ?? 100}% of the planned size.`];
  let cur = E;
  const stop0 = stopOf(E);
  levels.forEach((l, i) => {
    const n = i + 2;
    if (l.trigger === "SIGNAL") {
      const price = round(cur + sign * 0.2 * atr);
      steps.push({ price, fill: { kind: "entry", label: `Entry ${n} · ${l.allocationPercent}%` } });
      fills.push({ price, share: l.allocationPercent });
      summary.push(`Entry ${n}: ${l.allocationPercent}% when your rule becomes true — bought at the next candle's open, about ${rupee(price)}.`);
      cur = price;
      return;
    }
    const price = entryLevelPrice(l, E, atr, p.direction);
    if (price === null) return;
    const beyondStop = stop0 !== null && (short ? price >= stop0 : price <= stop0) && l.trigger === "PULLBACK";
    const word = l.trigger === "PULLBACK" ? `pullback of ${unitText(l.unit, l.value)}` : `breakout of ${unitText(l.unit, l.value)}`;
    if (beyondStop) {
      summary.push(`Entry ${n} (${word}, ${rupee(round(price))}) sits beyond your stop-loss (${rupee(stop0!)}), so it would never fill — the stop closes the position first. Move the level closer or widen the stop.`);
      return;
    }
    steps.push({ price: round(price), fill: { kind: "entry", label: `Entry ${n} · ${l.allocationPercent}%` } });
    fills.push({ price: round(price), share: l.allocationPercent });
    summary.push(`Entry ${n}: ${l.allocationPercent}% on a ${word} — ${rupee(round(price))}.`);
    cur = round(price);
  });
  const shares = fills.reduce((s, f) => s + f.share, 0);
  const avg = round(fills.reduce((s, f) => s + f.price * f.share, 0) / shares);
  if (fills.length > 1) summary.push(`Average price ${rupee(avg)} on ${Math.round(shares)}% of the planned size. Stop-loss and targets now measure from this average.`);
  const stopPx = stopOf(avg);
  const stopDist = distance(p.risk.stopLoss, avg, atr);
  if (stopPx !== null) summary.push(`Stop-loss ${rupee(stopPx)} (${unitText(p.risk.stopLoss!.unit, p.risk.stopLoss!.value)} from the average).`);

  // Targets: staged ones in order, or the single target.
  type Tp = { price: number; exitPercent: number; label: string; lock: string | null; newStop: number | null };
  const tps: Tp[] = [];
  if (staged.length) {
    let prev: number | null = null;
    staged.forEach((t, k) => {
      const price = targetPrice(t, avg, atr, p.direction, stopDist);
      if (price === null) return;
      const floor = lockFloor(t, price, avg, atr, p.direction, prev);
      const lock = floor !== null ? `then the stop on the rest moves to ${rupee(round(floor))}` : t.lock.mode === "TRAIL" ? "then the rest trails" : null;
      tps.push({ price: round(price), exitPercent: t.exitPercent, label: `TP${k + 1} · sells ${t.exitPercent}%`, lock, newStop: floor !== null ? round(floor) : null });
      summary.push(`TP${k + 1} at ${rupee(round(price))} (${unitText(t.unit, t.value)} from the average): sells ${t.exitPercent}% of the position${lock ? `, ${lock}` : ""}.`);
      prev = price;
    });
  } else if (p.risk.target) {
    const d = distance(p.risk.target, avg, atr);
    if (d !== null) {
      tps.push({ price: round(avg + sign * d), exitPercent: 100, label: "Target · sells all", lock: null, newStop: null });
      summary.push(`Target ${rupee(round(avg + sign * d))}: sells the whole position.`);
    }
  }
  for (const t of tps) steps.push({ price: t.price, fill: { kind: "exit", label: t.label } });
  const sold = tps.reduce((s, t) => s + t.exitPercent, 0);
  const endPrice = tps.length ? round(tps[tps.length - 1].price + sign * 0.5 * atr) : round(avg + sign * 2 * Math.max(stopDist ?? 0, atr));
  steps.push({ price: endPrice, hold: true });
  if (sold < 100 && tps.length) summary.push(`${Math.round(100 - sold)}% is still open after the last target — it is watched by the stop, the trailing stop and your exit rule.`);
  if (!tps.length) summary.push("No target is set, so the position stays open until your stop-loss, trailing stop or exit rule closes it.");

  // The made-up candles: the entry candle, then a walk through every step.
  const start = Math.max(0, r.signalIdx - PRE_BARS);
  const real = p.candles.slice(start, r.entryIdx);
  const dt = p.candles.length > 1 ? p.candles[1].time - p.candles[0].time : 86_400;
  const t0 = p.candles[r.entryIdx]?.time ?? p.candles[p.candles.length - 1].time + dt;
  const vol = p.candles[r.signalIdx]?.volume ?? 0;
  const synthetic: Candle[] = [{ time: t0, open: E, high: round(E + 0.15 * atr), low: round(E - 0.15 * atr), close: E, volume: Math.round(vol) }];
  const entryIdx = real.length;
  const marks: PlanFill[] = [{ idx: entryIdx, price: E, label: `Entry 1 · ${plan?.firstPercent ?? 100}%`, kind: "entry" }];
  const at: { fillIdx: number; step: Step }[] = [];
  let from = E;
  for (const st of steps) {
    const gap = Math.abs(st.price - from);
    const n = Math.max(5, Math.min(11, Math.round((gap / atr) * 2)));
    for (let k = 1; k <= n; k++) {
      const last = k === n;
      const open = synthetic[synthetic.length - 1].close;
      const close = last ? st.price : round(from + ((st.price - from) * k) / n + (rand() - 0.5) * 0.14 * atr);
      const pad = atr * 0.1 * (0.5 + rand());
      let high = Math.max(open, close) + pad;
      let low = Math.min(open, close) - pad;
      if (last) {
        if (st.price >= from) high = Math.max(high, st.price);
        else low = Math.min(low, st.price);
      }
      const idx = entryIdx + synthetic.length;
      synthetic.push({ time: t0 + synthetic.length * dt, open: round(open), high: round(high), low: round(low), close: round(close), volume: Math.round(vol * (0.7 + rand() * 0.6)) });
      if (last && st.fill) {
        marks.push({ idx, price: st.price, label: st.fill.label, kind: st.fill.kind });
        at.push({ fillIdx: idx, step: st });
      }
    }
    from = st.price;
  }
  const candles = [...real, ...synthetic];
  const exitIdx = candles.length - 1;

  // Level lines: where each level sits, from when it matters to when it is used.
  const lines: PlanLine[] = [];
  const entryFills = marks.filter((m) => m.kind === "entry");
  entryFills.slice(1).forEach((m) => lines.push({ price: m.price, label: m.label.split(" · ")[0], tone: "entry", fromIdx: entryIdx, toIdx: m.idx }));
  const lastEntry = entryFills[entryFills.length - 1];
  if (fills.length > 1) lines.push({ price: avg, label: `Average ${rupee(avg)}`, tone: "avg", fromIdx: lastEntry.idx, toIdx: null });
  let stopFrom = entryIdx;
  let stopNow = stop0 !== null && fills.length === 1 ? stop0 : stopPx;
  if (stop0 !== null && fills.length > 1) lines.push({ price: stop0, label: "Stop-loss", tone: "sl", fromIdx: entryIdx, toIdx: lastEntry.idx });
  if (stopPx !== null && fills.length > 1) stopFrom = lastEntry.idx;
  tps.forEach((t, k) => {
    const hit = at.find((a) => a.step.fill?.label === t.label)!.fillIdx;
    lines.push({ price: t.price, label: `TP${staged.length ? k + 1 : ""}`.trim() || "Target", tone: "tp", fromIdx: lastEntry.idx, toIdx: hit });
    if (stopNow !== null) lines.push({ price: stopNow, label: "Stop-loss", tone: "sl", fromIdx: stopFrom, toIdx: hit });
    if (t.newStop !== null) {
      stopNow = t.newStop;
      stopFrom = hit;
    }
  });
  if (stopNow !== null) lines.push({ price: stopNow, label: "Stop-loss", tone: "sl", fromIdx: stopFrom, toIdx: null });

  // What the whole thing earned: the shares sold at each target, and the rest valued at the last price.
  const move = (price: number) => ((price - avg) / avg) * 100 * sign;
  const pnlPct = round(tps.reduce((s, t) => s + (t.exitPercent / 100) * move(t.price), 0) + (Math.max(0, 100 - sold) / 100) * move(endPrice));

  return {
    id: "plan",
    kind: "plan",
    shows: "plan",
    illustration: true,
    candles,
    syntheticFrom: entryIdx,
    sourceIdx: candles.map((_, i) => (i < entryIdx ? start + i : null)),
    signalIdx: r.signalIdx - start,
    entryIdx,
    exitIdx,
    entryPrice: E,
    exitPrice: endPrice,
    stopLoss: null,
    target: null,
    trailing: null,
    checks: r.checks,
    pnlPct,
    entryReason: base.entryReason,
    plan: { lines, fills: marks, summary },
    note: levels.length && staged.length ? "Made-up prices, to show how your entry levels and targets work together." : levels.length ? "Made-up prices, to show how your entry levels fill." : "Made-up prices, to show how your targets are taken in turn.",
  };
}

const ORDER: ScenarioKind[] = ["target", "stop_loss", "trailing_stop", "exit_rule", "square_off", "end_of_data"];

const LEVEL_SET: Partial<Record<ScenarioKind, (p: StrategyPreview) => boolean>> = {
  target: (p) => !!p.risk.target,
  stop_loss: (p) => !!p.risk.stopLoss,
  trailing_stop: (p) => !!p.risk.trailing,
};

export function buildScenarios(p: StrategyPreview, mode: "demo" | "real" = "real"): Scenario[] {
  if (p.trades.length === 0) return [];
  const latestBy = new Map<ScenarioKind, PreviewTrade>();
  for (const t of p.trades) latestBy.set((t.exitReason ?? "exit_rule") as ScenarioKind, t);

  const out: Scenario[] = [];
  const base = p.trades[p.trades.length - 1];
  // Entry levels and staged targets get their own demo first: it is the part of the plan that single-entry replays can't show.
  const planned = planScenario(p, base);
  if (planned) out.push(planned);
  for (const kind of ORDER) {
    const real = latestBy.get(kind);
    const levelSet = LEVEL_SET[kind]?.(p) ?? false;
    if (levelSet && (mode === "demo" || !real)) {
      // In demo mode a real hit still lends its entry, so the chart before the entry is that trade's.
      const s = illustration(p, real ?? base, kind as "target" | "stop_loss" | "trailing_stop");
      if (s) out.push(real ? { ...s, alsoReal: true } : s);
      else if (real) out.push(realScenario(p, real));
    } else if (real) out.push(realScenario(p, real));
  }
  // "Still open" only when it's the only real outcome — it isn't an exit worth replaying otherwise.
  return out.length > 1 ? out.filter((s) => s.kind !== "end_of_data" || s.illustration) : out;
}
