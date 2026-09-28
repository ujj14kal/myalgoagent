import type { Candle } from "@/lib/market-data";
import type { PreviewTrade, StrategyPreview } from "@/lib/strategy-preview";
import type { ReplayCheck } from "@/lib/strategy-replay";

// Turns a strategy demo into the replay's scenarios: one real trade for each
// way a trade ended (take-profit, stop-loss, trailing stop, exit rule…), and —
// when the user set a take-profit / stop-loss / trailing stop that never
// triggered on the real data — an illustration of it: the real chart up to a
// real entry, then a made-up price path, run through the engine's exit order
// (trailing stop, then stop-loss, then take-profit) so it shows what the
// strategy's own settings would do. Illustrations are always labelled.

export type ScenarioKind = "target" | "stop_loss" | "trailing_stop" | "exit_rule" | "square_off" | "end_of_data";

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
};

export const SCENARIO_TITLE: Record<ScenarioKind, string> = {
  target: "Take-profit hit",
  stop_loss: "Stop-loss hit",
  trailing_stop: "Trailing stop hit",
  exit_rule: "Exit rule met",
  square_off: "Intraday square-off",
  end_of_data: "Still open",
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

const ORDER: ScenarioKind[] = ["target", "stop_loss", "trailing_stop", "exit_rule", "square_off", "end_of_data"];

export function buildScenarios(p: StrategyPreview): Scenario[] {
  if (p.trades.length === 0) return [];
  const latestBy = new Map<ScenarioKind, PreviewTrade>();
  for (const t of p.trades) latestBy.set((t.exitReason ?? "exit_rule") as ScenarioKind, t);

  const out: Scenario[] = [];
  const base = p.trades[p.trades.length - 1];
  for (const kind of ORDER) {
    const real = latestBy.get(kind);
    if (real) out.push(realScenario(p, real));
    else if (kind === "target" && p.risk.target) out.push(...[illustration(p, base, "target")].filter((s): s is Scenario => !!s));
    else if (kind === "stop_loss" && p.risk.stopLoss) out.push(...[illustration(p, base, "stop_loss")].filter((s): s is Scenario => !!s));
    else if (kind === "trailing_stop" && p.risk.trailing) out.push(...[illustration(p, base, "trailing_stop")].filter((s): s is Scenario => !!s));
  }
  // "Still open" only when it's the only real outcome — it isn't an exit worth replaying otherwise.
  return out.length > 1 ? out.filter((s) => s.kind !== "end_of_data" || s.illustration) : out;
}
