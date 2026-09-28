"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Check, Pause, Play, RotateCcw, X } from "lucide-react";
import type { StrategyPreview } from "@/lib/strategy-preview";
import type { ReplayShape } from "@/lib/strategy-replay";
import { buildScenarios, SCENARIO_TITLE, type Scenario, type ScenarioKind } from "@/lib/strategy-replay-scenarios";

// Animated replay of the strategy being built: candles play in one by one,
// the entry rule's parts tick off on the signal candle, the order fills, the
// entry / take-profit / stop-loss lines appear, the trailing stop follows the
// price, and the exit is marked with why it happened. Everything the rules
// use is drawn — indicator lines and oscillators with their thresholds,
// volume with its average, and each candle / chart / volume pattern with its
// own geometry — so the user can see their own strategy behave.

const C = {
  entry: "var(--brand-primary)",
  tp: "var(--brand-buy)",
  sl: "var(--brand-sell)",
  trail: "#d97706",
  signal: "var(--brand-gold)",
  up: "var(--brand-buy)",
  down: "var(--brand-sell)",
  grid: "rgba(14,27,45,0.07)",
  text: "rgba(14,27,45,0.55)",
};
const LINE_COLORS = ["#2563eb", "#0d9488", "#db2777", "#7c3aed", "#ea580c", "#0891b2"];
const MARKER_COLOR = { CANDLE_PATTERN: "#7c3aed", CHART_PATTERN: "#0891b2", VOLUME_PATTERN: "#ea580c" } as const;
const KIND_COLOR: Record<ScenarioKind, string> = { target: C.tp, stop_loss: C.sl, trailing_stop: C.trail, exit_rule: C.entry, square_off: "#64748b", end_of_data: "#64748b" };

const W = 760;
const ML = 8;
const MR = 66;
const PRICE_H = 300;
const VOL_H = 60;
const OSC_H = 78;
const AXIS_H = 20;
const GAP = 10;

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** Axis label precise enough that neighbouring ticks never read the same. */
const axis = (n: number, step: number) => n.toLocaleString("en-IN", { maximumFractionDigits: step >= 10 ? 0 : step >= 1 ? 1 : 2, minimumFractionDigits: step >= 10 ? 0 : step >= 1 ? 1 : 2 });
const when = (t: number, intraday: boolean) => {
  const d = new Date(t * 1000);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return intraday ? `${date} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })}` : date;
};
const istMinute = (t: number) => Math.floor(((t + 19_800) % 86_400) / 60);

const EXIT_TEXT: Record<ScenarioKind, string> = {
  target: "Take-profit hit",
  stop_loss: "Stop-loss hit",
  trailing_stop: "Trailing stop hit",
  exit_rule: "Exit rule met",
  square_off: "Squared off (intraday)",
  end_of_data: "End of data",
};

type Timeline = { pre: number; signal: number; entry: number; trade: number; exit: number; post: number; total: number };

/** Extra time on the signal candle so a pattern or crossover can be shown properly. */
function focusTime(preview: StrategyPreview, s: Scenario): number {
  const full = s.sourceIdx[s.signalIdx];
  const caught = preview.studies.markers.filter((m) => full !== null && full !== undefined && m.bars.includes(full));
  if (caught.length === 0) return preview.studies.overlays.some((o) => o.entry) || preview.studies.oscillators.some((o) => o.lines.some((l) => l.entry)) ? 700 : 0;
  return Math.max(...caught.map((m) => (m.family === "CANDLE_PATTERN" ? 500 + m.span * 450 : m.family === "CHART_PATTERN" ? 1700 : 1100)));
}

function timeline(s: Scenario, focus: number): Timeline {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const pre = clamp((s.signalIdx + 1) * 60, 1200, 2400);
  const signal = 1000 + s.checks.length * 500 + focus;
  const entry = 1200;
  const trade = clamp((s.exitIdx - s.entryIdx + 1) * 300, 2200, 9000);
  const exit = 2000;
  const post = Math.min(1800, (s.candles.length - 1 - s.exitIdx) * 110);
  return { pre, signal, entry, trade, exit, post, total: pre + signal + entry + trade + exit + post };
}

/** Phase start times (ms into the timeline). */
function phases(tl: Timeline) {
  const signalAt = tl.pre;
  const entryAt = signalAt + tl.signal;
  const tradeAt = entryAt + tl.entry;
  const exitAt = tradeAt + tl.trade;
  const postAt = exitAt + tl.exit;
  return { signalAt, entryAt, tradeAt, exitAt, postAt };
}

/** How far the animation has got, at `ms` into the timeline. */
function frameAt(s: Scenario, tl: Timeline, ms: number) {
  const { signalAt: t1, entryAt: t2, tradeAt: t3, exitAt: t4, postAt: t5 } = phases(tl);
  let bars: number;
  if (ms < t1) bars = (ms / tl.pre) * (s.signalIdx + 1);
  else if (ms < t3) bars = s.signalIdx + 1;
  else if (ms < t4) bars = s.entryIdx + 1 + ((ms - t3) / tl.trade) * (s.exitIdx - s.entryIdx);
  else if (ms < t5) bars = s.exitIdx + 1;
  else bars = s.exitIdx + 1 + (tl.post ? ((ms - t5) / tl.post) * (s.candles.length - 1 - s.exitIdx) : 0);
  const checksShown = ms < t1 ? 0 : Math.min(s.checks.length, Math.floor((ms - t1 - 500) / 500) + 1);
  return {
    ms,
    bars: Math.min(s.candles.length, bars),
    atSignal: ms >= t1,
    checksShown: Math.max(0, checksShown),
    entryProgress: ms < t2 ? 0 : Math.min(1, (ms - t2) / tl.entry),
    exited: ms >= t4,
    done: ms >= tl.total,
    sinceSignal: ms - t1,
    sinceEntry: ms - t2,
    sinceExit: ms - t4,
    /** When bar `i` of the trade appeared (for "the trailing stop just moved" tags). */
    barShownAt: (i: number) => (i <= s.entryIdx ? t3 : t3 + ((i - s.entryIdx - 1) / Math.max(1, s.exitIdx - s.entryIdx)) * tl.trade),
  };
}

export default function StrategyReplay({ preview }: { preview: StrategyPreview }) {
  const scenarios = useMemo(() => buildScenarios(preview), [preview]);
  const [selected, setSelected] = useState(0);
  const scenario = scenarios[Math.min(selected, scenarios.length - 1)];
  if (!scenario) return null;
  const missing = [
    !preview.risk.target && "take-profit",
    !preview.risk.stopLoss && "stop-loss",
    !preview.risk.trailing && "trailing stop",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected(i)}
            aria-pressed={i === selected}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
              i === selected ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy/70 ring-black/10 hover:bg-brand-bg"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[s.shows] }} />
            {SCENARIO_TITLE[s.shows]}
            {s.illustration && <span className={`rounded px-1 text-[9px] font-bold uppercase ${i === selected ? "bg-white/20" : "bg-brand-gold/20 text-[#8a7437]"}`}>Illustration</span>}
          </button>
        ))}
      </div>
      <ReplayPlayer key={scenario.id} preview={preview} s={scenario} />
      {missing.length > 0 && (
        <p className="text-xs text-brand-navy/50">
          No {missing.join(", ").replace(/, ([^,]*)$/, " or $1")} set, so {missing.length === 1 ? "that line isn't" : "those lines aren't"} drawn — add {missing.length === 1 ? "it" : "them"} under Risk to see {missing.length === 1 ? "it" : "them"} here.
        </p>
      )}
    </div>
  );
}

function ReplayPlayer({ preview, s }: { preview: StrategyPreview; s: Scenario }) {
  const reduce = useReducedMotion();
  const tl = useMemo(() => timeline(s, focusTime(preview, s)), [preview, s]);
  const [rawMs, setMs] = useState(0);
  const [wantPlaying, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const last = useRef<number | null>(null);
  // Reduced motion: show the finished picture until the user scrubs or presses play.
  const [touched, setTouched] = useState(false);
  const still = !!reduce && !touched;
  const ms = still ? tl.total : rawMs;
  const playing = wantPlaying && !still;

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setMs((m) => {
        const next = Math.min(tl.total, m + dt * speed);
        if (next >= tl.total) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl.total]);

  const f = frameAt(s, tl, ms);
  const visible = Math.floor(f.bars);
  const sign = preview.direction === "SHORT" ? -1 : 1;
  const lastVisible = s.candles[Math.max(0, Math.min(visible, s.candles.length) - 1)];
  const inTrade = f.entryProgress >= 1 && !f.exited;
  const livePnl = inTrade && lastVisible ? ((lastVisible.close - s.entryPrice) / s.entryPrice) * 100 * sign : null;
  const trailNow = s.trailing && inTrade ? s.trailing[Math.min(s.trailing.length - 1, Math.max(0, visible - 1 - s.entryIdx))] : null;

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
      {/* Status strip: what the strategy is doing right now — kept off the chart so no candle is hidden. */}
      <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 border-b border-black/5 px-3 py-2 text-[12px]">
        {f.entryProgress >= 1 ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-navy">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-buy text-white">
              <Check size={10} strokeWidth={3.5} />
            </span>
            {s.checks.filter((c) => c.ok).length} of {s.checks.length} condition{s.checks.length === 1 ? "" : "s"} met · {preview.direction === "SHORT" ? "sold" : "bought"} at {inr(s.entryPrice)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-brand-navy/55">
            <span className={`h-2 w-2 rounded-full ${f.atSignal ? "bg-brand-gold" : "animate-pulse bg-brand-primary/50"}`} />
            {f.atSignal ? "Entry rule is true on this candle — checking each part…" : "Watching for the entry rule…"}
          </span>
        )}
        {f.exited ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: KIND_COLOR[s.kind] }}>
              {EXIT_TEXT[s.kind]}
            </span>
            <span className={`text-sm font-bold tabular-nums ${s.pnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
              {s.pnlPct >= 0 ? "+" : ""}
              {s.pnlPct.toFixed(2)}%
            </span>
            <span className="text-brand-navy/45">exit {inr(s.exitPrice)}</span>
          </span>
        ) : livePnl !== null ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-brand-navy/45">In the trade</span>
            <span className={`text-sm font-bold tabular-nums ${livePnl >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
              {livePnl >= 0 ? "+" : ""}
              {livePnl.toFixed(2)}%
            </span>
            {trailNow !== null && (
              <span className="font-semibold" style={{ color: C.trail }}>
                trailing stop {inr(trailNow)}
              </span>
            )}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <ReplayChart preview={preview} s={s} f={f} />

        {/* The entry rule, ticked off on the signal candle. */}
        {f.atSignal && f.entryProgress < 1 && (
          <div className="pointer-events-none mx-2 mb-2 rounded-xl bg-white/95 p-2.5 text-[11.5px] shadow-[0_8px_24px_-12px_rgba(14,27,45,0.45)] ring-1 ring-black/5 backdrop-blur sm:absolute sm:left-2 sm:top-2 sm:m-0 sm:max-w-[48%]">
            <p className="font-semibold text-brand-navy">
              {preview.entryJoin === "OR" ? "Any of these on " : preview.entryJoin === "AND" ? "All of these on " : "Entry rule on "}
              {when(s.candles[s.signalIdx].time, preview.intraday)}
            </p>
            <ul className="mt-1.5 space-y-1">
              {s.checks.map((c, i) => (
                <li key={c.text} className={`flex gap-1.5 transition-opacity duration-300 ${i < f.checksShown ? "opacity-100" : "opacity-0"}`}>
                  <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-brand-buy text-white" : "bg-brand-navy/10 text-brand-navy/40"}`}>
                    {c.ok ? <Check size={10} strokeWidth={3.5} /> : <X size={10} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="text-brand-navy/85">{c.text}</span>
                    {c.detail && <span className="block text-[10.5px] text-brand-navy/50">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {f.checksShown >= s.checks.length && (
              <p className="mt-1.5 font-semibold text-brand-primary">
                → {preview.direction === "SHORT" ? "Sell" : "Buy"} at the next candle{f.entryProgress > 0 ? ` · filled ${inr(s.entryPrice)}` : ""}
              </p>
            )}
          </div>
        )}

      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setTouched(true);
            if (f.done) setMs(0);
            setPlaying(!playing || f.done);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-white hover:bg-brand-primary-light"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="translate-x-px" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setTouched(true);
            setMs(0);
            setPlaying(true);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-brand-navy/60 ring-1 ring-black/10 hover:bg-brand-bg"
          aria-label="Replay from the start"
        >
          <RotateCcw size={14} />
        </button>
        <input
          type="range"
          min={0}
          max={tl.total}
          value={ms}
          onChange={(e) => {
            setTouched(true);
            setPlaying(false);
            setMs(Number(e.target.value));
          }}
          className="min-w-0 flex-1 accent-[var(--brand-primary)]"
          aria-label="Scrub through the replay"
        />
        {[1, 2, 4].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setSpeed(x)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${speed === x ? "bg-brand-navy text-white" : "text-brand-navy/55 hover:bg-brand-bg"}`}
          >
            {x}×
          </button>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-black/5 px-3 py-2.5 text-[11.5px] text-brand-navy/60">
        <Legend preview={preview} s={s} />
        <p>
          {s.illustration ? (
            <>
              <strong className="text-brand-navy">Illustration:</strong> the chart and entry are real ({when(s.candles[s.signalIdx].time, preview.intraday)}); the price path after the entry is made up to show how your{" "}
              {SCENARIO_TITLE[s.shows].toLowerCase().replace(" hit", "")} works with your settings — this outcome didn&apos;t happen in the last {preview.periodLabel}.
            </>
          ) : (
            <>
              <strong className="text-brand-navy">Real trade</strong> from the last {preview.periodLabel}: entered {when(s.candles[s.entryIdx].time, preview.intraday)} because {s.entryReason}
              {s.kind === "exit_rule" && s.exitRuleReason ? `; exited because ${s.exitRuleReason}` : ""}.
            </>
          )}
          {s.note && <span className="mt-1 block font-medium text-[#8a7437]">{s.note}</span>}
        </p>
        {preview.studies.notes.map((n) => (
          <p key={n} className="text-brand-navy/45">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}

function Legend({ preview, s }: { preview: StrategyPreview; s: Scenario }) {
  const items: { label: string; color: string; dash?: boolean; box?: boolean }[] = [
    { label: "Signal candle", color: C.signal, box: true },
    { label: "Entry", color: C.entry, dash: true },
    ...(s.target !== null ? [{ label: "Take-profit", color: C.tp, dash: true }] : []),
    ...(s.stopLoss !== null ? [{ label: "Stop-loss", color: C.sl, dash: true }] : []),
    ...(s.trailing ? [{ label: "Trailing stop", color: C.trail }] : []),
    ...preview.studies.overlays.map((o, i) => ({ label: o.label, color: LINE_COLORS[i % LINE_COLORS.length] })),
    ...preview.studies.markers.map((m) => ({
      label: `${m.label} — caught ${m.bars.length}× in ${preview.periodLabel}${m.bars.length > 1 ? " (earlier ones shown faint)" : ""}`,
      color: MARKER_COLOR[m.family],
      box: true,
    })),
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.box ? (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color, opacity: 0.5 }} />
          ) : (
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={it.color} strokeWidth="2" strokeDasharray={it.dash ? "4 3" : undefined} />
            </svg>
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

type Frame = ReturnType<typeof frameAt>;

/** What to point at on each candle of a candle pattern, oldest first. */
const CANDLE_NOTES: Record<string, string[]> = {
  DOJI: ["Opens and closes at the same price — indecision"],
  HAMMER: ["Long lower wick — buyers pushed price back up"],
  INVERTED_HAMMER: ["Long upper wick after a fall — buyers testing"],
  SHOOTING_STAR: ["Long upper wick — sellers rejected the high"],
  HANGING_MAN: ["Long lower wick after a rise — selling showed up"],
  MARUBOZU_BULLISH: ["Full green body, almost no wicks — buyers in control"],
  MARUBOZU_BEARISH: ["Full red body, almost no wicks — sellers in control"],
  SPINNING_TOP: ["Small body, wicks both sides — neither side won"],
  BULLISH_ENGULFING: ["Red candle", "Green body swallows it"],
  BEARISH_ENGULFING: ["Green candle", "Red body swallows it"],
  BULLISH_HARAMI: ["Big red candle", "Small body inside it"],
  BEARISH_HARAMI: ["Big green candle", "Small body inside it"],
  TWEEZER_TOP: ["High", "Same high — rejected twice"],
  TWEEZER_BOTTOM: ["Low", "Same low — held twice"],
  PIERCING_LINE: ["Red candle", "Closes above its midpoint"],
  DARK_CLOUD_COVER: ["Green candle", "Closes below its midpoint"],
  MORNING_STAR: ["Big red", "Small star", "Strong green"],
  EVENING_STAR: ["Big green", "Small star", "Strong red"],
  THREE_WHITE_SOLDIERS: ["Soldier 1", "Soldier 2", "Soldier 3"],
  THREE_BLACK_CROWS: ["Crow 1", "Crow 2", "Crow 3"],
};
/** When each candle of a pattern gets its moment, after the signal starts (ms). */
const CANDLE_STEP = 450;
const CANDLE_START = 250;

/** Candles on screen at once — the camera pans along the replay instead of squeezing every candle in. */
const VIEW_BARS = 48;
const OVERVIEW_H = 22;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 0 → 1 → 0 over the window [a, a + len] (a smooth pulse). */
const bump = (t: number, a: number, len: number) => {
  const k = (t - a) / len;
  return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
};
const easeOutBack = (t: number) => {
  const c = 1.70158;
  const x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** The first `p` (0..1) of a polyline, by length — lets any line "draw itself". */
function partial(points: [number, number][], p: number): [number, number][] {
  if (p >= 1 || points.length < 2) return points;
  const seg = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i][0], q[1] - points[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) * clamp01(p);
  const out: [number, number][] = [points[0]];
  for (let i = 0; i < seg.length; i++) {
    if (left >= seg[i]) {
      out.push(points[i + 1]);
      left -= seg[i];
      continue;
    }
    const k = seg[i] ? left / seg[i] : 0;
    out.push([points[i][0] + (points[i + 1][0] - points[i][0]) * k, points[i][1] + (points[i + 1][1] - points[i][1]) * k]);
    break;
  }
  return out;
}
const pts = (p: [number, number][]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

function ReplayChart({ preview, s, f }: { preview: StrategyPreview; s: Scenario; f: Frame }) {
  const clipId = `plot-${useId().replace(/:/g, "")}`;
  const st = preview.studies;
  const n = s.candles.length;
  // Camera zooms in on the signal candle while the rule is checked, then eases back out as the order fills.
  const zoom = n > 24 && f.atSignal ? easeInOut(f.sinceSignal / 750) * (1 - easeInOut((f.sinceEntry - 150) / 900)) : 0;
  const viewN = Math.min(n, VIEW_BARS) * (1 - 0.32 * zoom);
  const plotW = W - ML - MR;
  const slot = plotW / viewN;
  const visible = Math.floor(f.bars);
  const frac = f.bars - visible;
  // Camera: keep the newest candle about 70% across; it glides as the replay plays.
  const head = Math.max(0, f.bars - 1);
  const camOf = (anchor: number, at: number) => Math.min(Math.max(0, anchor - viewN * at), n - viewN);
  const cam = camOf(head, 0.7) + (camOf(s.signalIdx, 0.6) - camOf(head, 0.7)) * zoom;
  const x = (i: number) => ML + (i - cam + 0.5) * slot;
  const first = Math.max(0, Math.floor(cam) - 1);
  const last = Math.min(n - 1, Math.ceil(cam + viewN) + 1);
  const src = (i: number) => s.sourceIdx[i];
  const at = (values: (number | null)[], i: number) => {
    const k = src(i);
    return k === null || k === undefined ? null : values[k];
  };
  const toLocal = (full: number) => {
    const i = s.sourceIdx.indexOf(full);
    return i === -1 ? null : i;
  };
  const shown = (i: number) => i < visible || (i === visible && frac > 0);

  // Panes.
  const oscs = st.oscillators.slice(0, 2);
  const pricePane = { top: 6, h: PRICE_H };
  const volTop = pricePane.top + PRICE_H + GAP;
  const volPane = st.volume.show ? { top: volTop, h: VOL_H } : null;
  const oscTop = volTop + (volPane ? VOL_H + GAP : 0);
  const oscPanes = oscs.map((o, k) => ({ key: o.key, top: oscTop + k * (OSC_H + GAP), h: OSC_H, osc: o }));
  const axisTop = oscTop + oscs.length * (OSC_H + GAP);
  const H = axisTop + AXIS_H + OVERVIEW_H;

  // Price scale fits what's on screen (a few bars either side so it doesn't jump);
  // levels far outside become edge markers instead of squashing the candles.
  // Only candles already drawn count — the path ahead must not squash (or give away) what's coming.
  const drawn = s.candles.slice(Math.max(0, first - 4), Math.min(n, visible));
  const win = drawn.length ? drawn : s.candles.slice(first, last + 1);
  let lo = Math.min(...win.map((c) => c.low));
  let hi = Math.max(...win.map((c) => c.high));
  if (drawn.length && visible < n && frac > 0) {
    const c = s.candles[visible];
    const g = easeOut(frac);
    const close = c.open + (c.close - c.open) * g;
    hi = Math.max(hi, Math.max(c.open, close) + (c.high - Math.max(c.open, c.close)) * g);
    lo = Math.min(lo, Math.min(c.open, close) - (Math.min(c.open, c.close) - c.low) * g);
  }
  const span = hi - lo || hi * 0.01;
  // Judged against the candles alone — otherwise each level pulled in widens the range for the next one.
  const [lo0, hi0] = [lo, hi];
  const near = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > lo0 - span * 0.6 && v < hi0 + span * 0.6;
  const inTrade = f.entryProgress > 0;
  const trailNow = s.trailing ? s.trailing[Math.min(s.trailing.length - 1, Math.max(0, Math.min(visible, s.exitIdx) - 1 - s.entryIdx))] : null;
  for (const v of inTrade ? [s.entryPrice, s.stopLoss, s.target, trailNow, f.exited ? s.exitPrice : null] : []) if (near(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  for (const o of st.overlays) for (let i = first; i <= last; i++) {
    const v = at(o.values, i);
    if (near(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  }
  // While zoomed in on the signal, the price scale also tightens around it, so the pattern's candles get big.
  if (zoom > 0) {
    const fullSig = s.sourceIdx[s.signalIdx];
    const vals = s.candles.slice(Math.max(0, s.signalIdx - 12), s.signalIdx + 1).flatMap((c) => [c.low, c.high]);
    for (const o of st.overlays) if (o.entry) for (let i = Math.max(0, s.signalIdx - 3); i <= s.signalIdx; i++) {
      const v = at(o.values, i);
      if (v !== null) vals.push(v);
    }
    for (const m of st.markers) if (fullSig !== null && fullSig !== undefined && m.shapes[fullSig]) for (const l of m.shapes[fullSig].lines) if (l.pane === "price") vals.push(...l.pts.map((q) => q[1]));
    const [fLo, fHi] = [Math.min(...vals), Math.max(...vals)];
    const z = easeInOut(zoom);
    lo += (Math.max(lo, fLo) - lo) * z;
    hi += (Math.min(hi, fHi) - hi) * z;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const py = (v: number) => pricePane.top + ((hi - v) / (hi - lo)) * pricePane.h;
  const pyClamped = (v: number) => Math.min(pricePane.top + pricePane.h - 9, Math.max(pricePane.top + 9, py(v)));
  const offscreen = (v: number) => (v > hi ? "up" : v < lo ? "down" : null);

  const upto = Math.max(first + 1, Math.min(last + 1, visible + 1));
  const paneY = (pane: string): ((v: number) => number) | null => {
    if (pane === "price") return py;
    if (pane === "volume" && volPane) {
      const vmax = Math.max(...s.candles.slice(first, upto).map((c) => c.volume), 1);
      return (v) => volPane.top + volPane.h - (Math.min(v, vmax * 1.05) / (vmax * 1.05)) * volPane.h;
    }
    const p = oscPanes.find((o) => o.key === pane);
    if (!p) return null;
    const vals = p.osc.lines.flatMap((l) => s.candles.slice(first, upto).map((_, k) => at(l.values, first + k))).filter((v): v is number => v !== null);
    const all = [...vals, ...p.osc.levels];
    let a = Math.min(...all);
    let b = Math.max(...all);
    if (!Number.isFinite(a) || a === b) [a, b] = [(a || 0) - 1, (b || 0) + 1];
    const m = (b - a) * 0.12;
    return (v) => p.top + ((b + m - v) / (b - a + 2 * m)) * p.h;
  };

  const linePath = (values: (number | null)[], y: (v: number) => number) => {
    let d = "";
    let pen = false;
    for (let i = first; i <= Math.min(last, visible - 1); i++) {
      const v = at(values, i);
      if (v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  // ---- timings (all pure functions of the replay clock, so scrubbing is exact) ----
  const signalIn = clamp01(f.sinceSignal / 450);
  const entryP = clamp01(f.sinceEntry / 900);
  const exitP = clamp01(f.sinceExit / 1100);
  const signalPulse = f.atSignal && f.sinceEntry < 0 ? (f.sinceSignal % 1200) / 1200 : -1;

  const entryX = x(s.entryIdx);
  const tradeEnd = f.exited ? x(s.exitIdx) : x(Math.max(s.entryIdx, f.bars - 1));
  const lineTo = Math.max(entryX + 70 * easeOut(entryP), tradeEnd);
  const hitLevel = s.kind === "target" ? s.target : s.kind === "stop_loss" ? s.stopLoss : null;

  const levelLine = (v: number | null, color: string, label: string) => {
    if (v === null || !inTrade) return null;
    const off = offscreen(v);
    const y = off ? pyClamped(v) : py(v);
    const flash = f.exited && hitLevel === v ? 1 - exitP : 0;
    return (
      <g key={label} opacity={easeOut(entryP)}>
        {!off && (
          <line x1={x(s.signalIdx)} x2={lineTo} y1={y} y2={y} stroke={color} strokeWidth={1.6 + 2.4 * flash} strokeDasharray="6 4" clipPath={`url(#${clipId})`} />
        )}
        <rect x={W - MR + 2} y={y - 11} width={MR - 4} height={22} rx={5} fill={color} />
        <text x={W - MR / 2} y={y - 1.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
          {off === "up" ? "▲ " : off === "down" ? "▼ " : ""}
          {label}
        </text>
        <text x={W - MR / 2} y={y + 8} textAnchor="middle" fontSize={8} fill="white" opacity={0.9}>
          {v.toLocaleString("en-IN", { maximumFractionDigits: v >= 1000 ? 0 : 2 })}
        </text>
      </g>
    );
  };
  const zone = (to: number | null, color: string, boost: number) => {
    if (to === null || !inTrade) return null;
    const y1 = Math.min(Math.max(py(s.entryPrice), pricePane.top), pricePane.top + pricePane.h);
    const y2 = Math.min(Math.max(py(to), pricePane.top), pricePane.top + pricePane.h);
    return <rect x={entryX} width={Math.max(0, lineTo - entryX)} y={Math.min(y1, y2)} height={Math.abs(y1 - y2)} fill={color} opacity={(0.07 + 0.18 * boost) * easeOut(entryP)} />;
  };

  // Trailing stop as a staircase, with a tag each time it ratchets.
  const trailSteps: { x1: number; x2: number; y: number; i: number; v: number; moved: boolean }[] = [];
  if (s.trailing && inTrade) {
    const until = f.exited ? s.exitIdx : Math.min(visible - 1 + (frac > 0 ? 1 : 0), s.exitIdx);
    for (let i = Math.max(s.entryIdx, first); i <= Math.min(until, last); i++) {
      const v = s.trailing[i - s.entryIdx];
      if (v === null || v === undefined) continue;
      const prev = i > s.entryIdx ? s.trailing[i - s.entryIdx - 1] : null;
      const moved = prev !== null && prev !== undefined && (preview.direction === "SHORT" ? v < prev : v > prev);
      trailSteps.push({ x1: x(i) - slot / 2, x2: x(i) + slot / 2, y: py(v), i, v, moved });
    }
  }
  const trailD = trailSteps.map((t, k) => `${k ? "L" : "M"}${t.x1.toFixed(1)},${t.y.toFixed(1)}L${t.x2.toFixed(1)},${t.y.toFixed(1)}`).join("");

  const markers = st.markers.flatMap((m) =>
    m.bars
      .map((b) => ({ m, local: toLocal(b), full: b }))
      .filter((h): h is { m: typeof m; local: number; full: number } => h.local !== null && h.local < visible && h.local >= first - 30 && h.local <= last),
  );

  /** A pattern's lines drawing themselves in, then its labelled points popping up. */
  const shapeLayer = (shape: ReplayShape, color: string, pane: string | null, p: number) => {
    const lines = shape.lines.filter((l) => (pane ? l.pane === pane : true));
    const pointsOf = (l: ReplayShape["lines"][number]) => {
      const y = paneY(l.pane);
      const out: [number, number][] = [];
      for (const [fi, v] of l.pts) {
        const li = toLocal(fi);
        if (li !== null && y) out.push([x(li), y(v)]);
      }
      return out;
    };
    return (
      <g>
        {lines.map((l, k) => {
          const ps = pointsOf(l);
          const lp = clamp01(p * lines.length - k * 0.6);
          return ps.length < 2 || lp === 0 ? null : (
            <polyline key={k} points={pts(partial(ps, easeOut(lp)))} fill="none" stroke={color} strokeWidth={l.style === "shape" ? 2.2 : 1.4} strokeDasharray={l.style === "shape" ? undefined : "5 4"} strokeLinejoin="round" strokeLinecap="round" />
          );
        })}
        {shape.points
          .filter((q) => (pane ? q.pane === pane : true))
          .map((q, k, arr) => {
            const li = toLocal(q.idx);
            const y = paneY(q.pane);
            const pop = easeOutBack(clamp01(p * (arr.length + 1) - k - 0.6));
            return li === null || !y || pop <= 0 ? null : (
              <g key={`${q.label}-${q.idx}`} opacity={clamp01(pop)}>
                <circle cx={x(li)} cy={y(q.value)} r={3.4 * pop} fill={color} stroke="white" strokeWidth={1.2} />
                <text x={x(li)} y={y(q.value) - 8} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                  {q.label}
                </text>
              </g>
            );
          })}
      </g>
    );
  };

  const candleBody = (i: number) => {
    const c = s.candles[i];
    const growing = i === visible;
    const g = growing ? easeOut(frac) : 1;
    const close = c.open + (c.close - c.open) * g;
    const high = Math.max(c.open, close) + (c.high - Math.max(c.open, c.close)) * g;
    const low = Math.min(c.open, close) - (Math.min(c.open, c.close) - c.low) * g;
    const up = c.close >= c.open;
    const color = up ? C.up : C.down;
    const bw = Math.max(2, slot * 0.66);
    const synthetic = s.syntheticFrom !== null && i >= s.syntheticFrom;
    return (
      <g key={c.time} opacity={(synthetic ? 0.78 : 1) * (growing ? 0.35 + 0.65 * g : 1)}>
        <line x1={x(i)} x2={x(i)} y1={py(high)} y2={py(low)} stroke={color} strokeWidth={Math.max(1, slot * 0.08)} />
        <rect x={x(i) - bw / 2} y={py(Math.max(c.open, close))} width={bw} height={Math.max(1, Math.abs(py(c.open) - py(close)))} rx={Math.min(1.5, bw / 6)} fill={up ? "white" : color} stroke={color} strokeWidth={1.1} />
      </g>
    );
  };

  // ---- the moment of detection: exactly what was caught, drawn for its kind ----
  const sinceSig = f.sinceSignal;
  const sigMarkers = markers.filter((h) => h.local === s.signalIdx);
  const fadeAfterEntry = 1 - clamp01((f.sinceEntry - 300) / 700);
  const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 2 });

  const tag = (tx: number, ty: number, color: string, text: string, opacity: number, anchor: "start" | "middle" | "end" = "middle") =>
    opacity <= 0.01 ? null : (
      <text key={`${text}-${tx.toFixed(0)}`} x={tx} y={ty} textAnchor={anchor} fontSize={10} fontWeight={700} fill={color} stroke="white" strokeWidth={3.2} paintOrder="stroke" opacity={opacity}>
        {text}
      </text>
    );

  /** A ring and rays where something just happened (a cross, a breakout). */
  const burst = (cx: number, cy: number, color: string, t0: number) => {
    const k = clamp01((sinceSig - t0) / 850);
    if (!f.atSignal || k <= 0 || k >= 1) return null;
    const e = easeOut(k);
    return (
      <g key={`burst-${t0}-${cx.toFixed(0)}`} opacity={1 - k * k}>
        <circle cx={cx} cy={cy} r={4 + 22 * e} fill="none" stroke={color} strokeWidth={2.4 * (1 - k) + 0.4} />
        {Array.from({ length: 8 }, (_, j) => {
          const a = (j / 8) * Math.PI * 2 + 0.4;
          return <line key={j} x1={cx + Math.cos(a) * (5 + 9 * e)} y1={cy + Math.sin(a) * (5 + 9 * e)} x2={cx + Math.cos(a) * (9 + 18 * e)} y2={cy + Math.sin(a) * (9 + 18 * e)} stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
        })}
      </g>
    );
  };

  // Crossovers: where two lines (or a line and a threshold) crossed on the signal candle.
  type Series = { label: string; at: (i: number) => number | null };
  const crossOf = (a: Series, b: Series, y: (v: number) => number) => {
    const i = s.signalIdx;
    if (i < 1) return null;
    const [a0, a1, b0, b1] = [a.at(i - 1), a.at(i), b.at(i - 1), b.at(i)];
    if (a0 === null || a1 === null || b0 === null || b1 === null) return null;
    const [d0, d1] = [a0 - b0, a1 - b1];
    if (!((d0 <= 0 && d1 > 0) || (d0 >= 0 && d1 < 0))) return null;
    const t = d0 / (d0 - d1);
    return { x: x(i - 1) + (x(i) - x(i - 1)) * t, y: y(a0 + (a1 - a0) * t), text: `${a.label} crossed ${d1 > 0 ? "above" : "below"} ${b.label}` };
  };
  const crosses: { x: number; y: number; text: string }[] = [];
  if (f.atSignal) {
    const ov: Series[] = st.overlays.filter((o) => o.entry).map((o) => ({ label: o.label, at: (i: number) => at(o.values, i) }));
    const pair = ov.length === 1 ? [{ label: "Price", at: (i: number) => s.candles[i].close }, ov[0]] : ov;
    const c = pair.length >= 2 ? crossOf(pair[0], pair[1], py) : null;
    if (c) crosses.push(c);
    for (const p of oscPanes) {
      const y = paneY(p.key)!;
      const ls: Series[] = p.osc.lines.filter((l) => l.entry).map((l) => ({ label: l.label, at: (i: number) => at(l.values, i) }));
      if (ls.length >= 2) {
        const c2 = crossOf(ls[0], ls[1], y);
        if (c2) crosses.push(c2);
      } else if (ls.length === 1) {
        for (const lv of p.osc.levels) {
          const c2 = crossOf(ls[0], { label: String(lv), at: () => lv }, y);
          if (c2) {
            crosses.push(c2);
            break;
          }
        }
      }
    }
  }

  // Oscillator zones: the stretch where the line sat beyond the threshold the rule uses.
  const oscZones = f.atSignal
    ? oscPanes.flatMap((p) => {
        const y = paneY(p.key)!;
        return p.osc.lines
          .filter((l) => l.entry)
          .flatMap((l) => {
            const v = at(l.values, s.signalIdx);
            if (v === null || p.osc.levels.length === 0) return [];
            const [lvLo, lvHi] = [Math.min(...p.osc.levels), Math.max(...p.osc.levels)];
            const level = v <= lvLo ? lvLo : v >= lvHi ? lvHi : null;
            if (level === null) return [];
            const beyond = (u: number) => (level === lvLo ? u <= level : u >= level);
            const polys: string[] = [];
            let run: [number, number][] = [];
            const flush = () => {
              if (run.length > 1) polys.push(pts([...run, [run[run.length - 1][0], y(level)], [run[0][0], y(level)]]));
              run = [];
            };
            for (let i = Math.max(first, s.signalIdx - 20); i <= s.signalIdx; i++) {
              const u = at(l.values, i);
              if (u !== null && beyond(u)) run.push([x(i), y(u)]);
              else flush();
            }
            flush();
            return polys.map((d, k) => ({ key: `${p.key}-${l.label}-${k}`, d, text: `${l.label} ${level === lvLo ? "below" : "above"} ${level}`, ly: y(level) }));
          });
      })
    : [];

  // Live values on the lines the rule reads, counting up to the signal candle's value.
  const valueTags = f.atSignal
    ? [
        ...st.overlays.flatMap((o, k) => (o.entry ? [{ label: o.label, values: o.values, y: py, color: LINE_COLORS[k % LINE_COLORS.length] }] : [])),
        ...oscPanes.flatMap((p) => p.osc.lines.flatMap((l, k) => (l.entry ? [{ label: l.label, values: l.values, y: paneY(p.key)!, color: LINE_COLORS[(k + 2) % LINE_COLORS.length] }] : []))),
      ]
    : [];
  const countUp = easeOut((sinceSig - 150) / 800);

  // Candle patterns: each candle of the pattern gets its moment, with what to look at.
  const candleGeometry = (pattern: string, from: number, local: number, color: string, span: number) => {
    const e = easeOut((sinceSig - (CANDLE_START + (span - 1) * CANDLE_STEP)) / 600);
    if (e <= 0) return null;
    const op = 0.35 + 0.65 * fadeAfterEntry;
    const c0 = s.candles[from];
    const cl = s.candles[local];
    const bw = Math.max(2, slot * 0.66);
    const across = (v: number, dashed = true) => {
      const x0 = x(from) - bw / 2 - 3;
      const x1 = x0 + (x(local) + bw / 2 + 3 - x0) * e;
      return <line x1={x0} x2={x1} y1={py(v)} y2={py(v)} stroke={color} strokeWidth={1.8} strokeDasharray={dashed ? "4 3" : undefined} />;
    };
    const wick = (upper: boolean) => {
      const bodyEdge = upper ? Math.max(cl.open, cl.close) : Math.min(cl.open, cl.close);
      const tip = upper ? cl.high : cl.low;
      const y2 = py(bodyEdge) + (py(tip) - py(bodyEdge)) * e;
      return (
        <g>
          <line x1={x(local)} x2={x(local)} y1={py(bodyEdge)} y2={y2} stroke={color} strokeWidth={6} opacity={0.35} strokeLinecap="round" filter={`url(#${clipId}-glow)`} />
          <line x1={x(local)} x2={x(local)} y1={py(bodyEdge)} y2={y2} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
    };
    let g: ReactNode = null;
    if (pattern === "HAMMER" || pattern === "HANGING_MAN") g = wick(false);
    else if (pattern === "INVERTED_HAMMER" || pattern === "SHOOTING_STAR") g = wick(true);
    else if (pattern === "DOJI" || pattern === "SPINNING_TOP")
      g = (
        <g>
          {[cl.open, cl.close].map((v, k) => (
            <line key={k} x1={x(local) - slot * 0.95 * e} x2={x(local) + slot * 0.95 * e} y1={py(v)} y2={py(v)} stroke={color} strokeWidth={1.8} />
          ))}
        </g>
      );
    else if (/ENGULFING|HARAMI/.test(pattern)) {
      const [top, bot] = [py(Math.max(c0.open, c0.close)), py(Math.min(c0.open, c0.close))];
      const x0 = x(from) - bw / 2 - 2;
      g = <rect x={x0} y={top} width={(x(local) + bw / 2 + 2 - x0) * e} height={Math.max(1, bot - top)} rx={2} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={1.6} strokeDasharray="4 3" />;
    } else if (pattern === "PIERCING_LINE" || pattern === "DARK_CLOUD_COVER") {
      const mid = (c0.open + c0.close) / 2;
      g = (
        <g>
          {across(mid)}
          {tag(x(from) - bw / 2 - 5, py(mid) + 3.5, color, "midpoint", e, "end")}
        </g>
      );
    } else if (pattern === "TWEEZER_TOP") g = across(Math.max(c0.high, cl.high), false);
    else if (pattern === "TWEEZER_BOTTOM") g = across(Math.min(c0.low, cl.low), false);
    else if (span > 2) {
      const path = s.candles.slice(from, local + 1).map((c, k): [number, number] => [x(from + k), py(c.close)]);
      g = <polyline points={pts(partial(path, e))} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />;
    } else if (pattern.startsWith("MARUBOZU")) {
      const [top, bot] = [py(Math.max(cl.open, cl.close)), py(Math.min(cl.open, cl.close))];
      g = <rect x={x(local) - bw / 2 - 3} y={top - 3} width={bw + 6} height={bot - top + 6} rx={3} fill="none" stroke={color} strokeWidth={2} opacity={e} />;
    }
    return <g opacity={op}>{g}</g>;
  };

  const candleMoments = sigMarkers
    .filter((h) => h.m.family === "CANDLE_PATTERN")
    .map(({ m, local }) => {
      const color = MARKER_COLOR.CANDLE_PATTERN;
      const from = Math.max(0, local - m.span + 1);
      const span = local - from + 1;
      const notes = CANDLE_NOTES[m.pattern] ?? [];
      const cs = s.candles.slice(from, local + 1);
      const top = py(Math.max(...cs.map((c) => c.high)));
      // Notes sit in the empty space right of the signal candle (later candles aren't drawn yet).
      const noteX = x(local) + slot * 0.5 + 12;
      return (
        <g key={`cm-${m.label}`}>
          {candleGeometry(m.pattern, from, local, color, span)}
          {cs.map((c, j) => {
            const i = from + j;
            const t0 = CANDLE_START + j * CANDLE_STEP;
            const b = bump(sinceSig, t0, CANDLE_STEP * 1.7);
            const cx = x(i);
            const cy = py((c.high + c.low) / 2);
            const noteIn = easeOut((sinceSig - t0) / 320) * fadeAfterEntry;
            const ny = Math.max(pricePane.top + 12, top + 6) + j * 14;
            return (
              <g key={i}>
                {b > 0 && f.atSignal && (
                  <g transform={`translate(${cx} ${cy}) scale(${1 + 0.5 * b}) translate(${-cx} ${-cy})`}>
                    <rect x={cx - slot * 0.55} y={py(c.high) - 4} width={slot * 1.1} height={py(c.low) - py(c.high) + 8} rx={4} fill={color} opacity={0.28 * b} filter={`url(#${clipId}-glow)`} />
                    {candleBody(i)}
                  </g>
                )}
                {notes[j] && noteIn > 0.01 && (
                  <g opacity={noteIn}>
                    {span > 1 && (
                      <g transform={`translate(${cx} ${Math.min(py(c.low) + 11, pricePane.top + pricePane.h - 7)}) scale(${0.6 + 0.4 * easeOutBack((sinceSig - t0) / 350)})`}>
                        <circle r={6} fill={color} stroke="white" strokeWidth={1.2} />
                        <text y={3} textAnchor="middle" fontSize={8} fontWeight={800} fill="white">
                          {j + 1}
                        </text>
                      </g>
                    )}
                    <g transform={`translate(${noteX + 8 * (1 - easeOut((sinceSig - t0) / 320))} ${ny})`}>
                      {span > 1 && (
                        <>
                          <circle cx={5} cy={-3.5} r={5.5} fill={color} />
                          <text x={5} y={-0.8} textAnchor="middle" fontSize={7.5} fontWeight={800} fill="white">
                            {j + 1}
                          </text>
                        </>
                      )}
                      <text x={span > 1 ? 14 : 0} y={0} fontSize={10} fontWeight={700} fill={color} stroke="white" strokeWidth={3.2} paintOrder="stroke">
                        {notes[j]}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      );
    });

  // Chart patterns: the break of the pattern line, the line carried forward, and the measured move.
  const chartMoments = sigMarkers
    .filter((h) => h.m.family === "CHART_PATTERN")
    .map(({ m, local, full }) => {
      const shape = m.shapes[full];
      if (!shape) return null;
      const color = MARKER_COLOR.CHART_PATTERN;
      const priceLines = shape.lines.filter((l) => l.pane === "price");
      const necks = priceLines
        .filter((l) => l.style === "neck")
        .map((l) => {
          const [a, b] = [l.pts[0], l.pts[l.pts.length - 1]];
          const slope = b[0] === a[0] ? 0 : (b[1] - a[1]) / (b[0] - a[0]);
          return (fi: number) => a[1] + slope * (fi - a[0]);
        });
      if (necks.length === 0) return null;
      const close = s.candles[local].close;
      const vals = necks.map((nk) => nk(full));
      let k = 0;
      if (necks.length > 1) {
        const upper = vals[0] >= vals[1] ? 0 : 1;
        k = close >= vals[upper] ? upper : 1 - upper;
      }
      const neckV = vals[k];
      const up = close >= neckV;
      const all = priceLines.flatMap((l) => l.pts.map((q) => q[1]));
      const h = up ? neckV - Math.min(...all) : Math.max(...all) - neckV;
      const target = h > 0 ? neckV + (up ? h : -h) : null;
      const tBreak = 1100;
      const ext = easeOut((sinceSig - tBreak + 250) / 550);
      const arrowP = easeOut((sinceSig - tBreak - 400) / 800);
      const keep = 0.4 + 0.6 * fadeAfterEntry;
      const ax = x(local) + slot * 1.8;
      const y0 = py(neckV);
      const y1 = target === null ? y0 : y0 + (pyClamped(target) - y0) * arrowP;
      return (
        <g key={`chm-${m.label}`}>
          {ext > 0 && <line x1={x(local)} y1={y0} x2={x(local + 7 * ext)} y2={py(necks[k](full + 7 * ext))} stroke={color} strokeWidth={1.5} strokeDasharray="5 4" opacity={keep} />}
          {burst(x(local), y0, color, tBreak)}
          {tag(x(local) - 7, y0 + (up ? 15 : -9), color, up ? "Breakout ↑" : "Breakdown ↓", easeOut((sinceSig - tBreak) / 300) * fadeAfterEntry, "end")}
          {target !== null && arrowP > 0 && (
            <g opacity={keep}>
              <line x1={ax - 5} x2={ax + 5} y1={y0} y2={y0} stroke={color} strokeWidth={1.5} />
              <line x1={ax} x2={ax} y1={y0} y2={y1} stroke={color} strokeWidth={2} />
              <path d={`M${ax},${y1}l-4.5,${up ? 7 : -7}h9z`} fill={color} />
              {tag(ax + 7, y1 + (up ? 4 : 2), color, `Measured move ${inr(target)}`, arrowP, "start")}
            </g>
          )}
        </g>
      );
    });

  // Volume patterns: the bar against its 20-bar average, with the multiple counting up.
  const VOL_RATIO = new Set(["VOLUME_SPIKE", "VOLUME_DRY_UP", "BULLISH_VOLUME_BREAKOUT", "BEARISH_VOLUME_BREAKDOWN"]);
  const volMoment = sigMarkers.find((h) => h.m.family === "VOLUME_PATTERN" && VOL_RATIO.has(h.m.pattern));
  const volAvgFrom = Math.max(0, s.signalIdx - 20);
  const volAvg = s.signalIdx > 0 ? s.candles.slice(volAvgFrom, s.signalIdx).reduce((a, c) => a + c.volume, 0) / (s.signalIdx - volAvgFrom) : 0;
  /** The signal bar winds back to the average, then shoots to its real height. */
  const volRegrow = (full: number, avgH: number) => {
    if (!volMoment || !f.atSignal || sinceSig >= 1100) return full;
    return sinceSig < 300 ? full + (avgH - full) * easeInOut(sinceSig / 300) : avgH + (full - avgH) * easeOutBack((sinceSig - 300) / 800);
  };
  const volumeMoment = (() => {
    if (!volMoment || !volPane || !f.atSignal || volAvg <= 0) return null;
    const y = paneY("volume")!;
    const color = MARKER_COLOR.VOLUME_PATTERN;
    const reveal = easeOut(sinceSig / 550);
    const x0 = x(volAvgFrom) - slot / 2;
    const x1 = x0 + (x(s.signalIdx) + slot / 2 - x0) * reveal;
    const ratio = s.candles[s.signalIdx].volume / volAvg;
    const shownRatio = 1 + (ratio - 1) * easeOut((sinceSig - 300) / 800);
    const keep = 0.35 + 0.65 * fadeAfterEntry;
    const barTop = Math.max(volPane.top + 22, y(s.candles[s.signalIdx].volume) + 4);
    const level = volMoment.m.shapes[volMoment.full]?.lines.find((l) => l.style === "level")?.pts[0]?.[1];
    return (
      <g>
        <g opacity={keep}>
          <rect x={x0} y={y(volAvg)} width={Math.max(0, x1 - x0)} height={volPane.top + volPane.h - y(volAvg)} fill={color} opacity={0.08} />
          <line x1={x0} x2={x1} y1={y(volAvg)} y2={y(volAvg)} stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />
          {tag(x(s.signalIdx) - slot / 2 - 4, y(volAvg) - 3, color, "20-bar average", reveal * 0.9, "end")}
        </g>
        {tag(x(s.signalIdx) + slot * 0.45 + 5, barTop, color, `${shownRatio.toFixed(1)}× average`, easeOut((sinceSig - 300) / 300) * keep, "start")}
        {level !== undefined && burst(x(s.signalIdx), py(level), color, 900)}
      </g>
    );
  })();

  // Everything but the moment itself steps back while the camera is zoomed in.
  let spotFrom = s.signalIdx - 1;
  for (const h of sigMarkers) {
    if (h.m.family === "CANDLE_PATTERN") spotFrom = Math.min(spotFrom, h.local - h.m.span + 1);
    const sh = h.m.shapes[h.full];
    if (sh) for (const l of sh.lines) for (const [fi] of l.pts) {
      const li = toLocal(fi);
      if (li !== null) spotFrom = Math.min(spotFrom, li);
    }
  }
  spotFrom = Math.max(0, spotFrom);

  const exitColor = KIND_COLOR[s.kind];
  const ex = x(s.exitIdx);
  const ey = py(s.exitPrice);
  const tickIdx = Array.from({ length: 5 }, (_, k) => Math.round(cam + (k / 4) * (viewN - 1))).filter((i) => i >= 0 && i < n);

  // Overview strip: the whole window, the part on screen, and where the trade was.
  const ovTop = axisTop + AXIS_H;
  const ovX = (i: number) => ML + (i / Math.max(1, n - 1)) * plotW;
  const closes = s.candles.map((c) => c.close);
  const [cMin, cMax] = [Math.min(...closes), Math.max(...closes)];
  const ovY = (v: number) => ovTop + 3 + (1 - (v - cMin) / (cMax - cMin || 1)) * (OVERVIEW_H - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`Replay of a ${SCENARIO_TITLE[s.kind].toLowerCase()} trade on ${preview.symbol}`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={ML} y={0} width={plotW} height={axisTop} />
        </clipPath>
        <pattern id={`${clipId}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(14,27,45,0.06)" strokeWidth="3" />
        </pattern>
        <filter id={`${clipId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* pane frames + price grid */}
      {[pricePane, volPane, ...oscPanes].filter(Boolean).map((p, k) => (
        <rect key={k} x={ML} y={p!.top} width={plotW} height={p!.h} rx={6} fill="rgba(14,27,45,0.012)" stroke={C.grid} />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((r) => (
        <g key={r}>
          <line x1={ML} x2={W - MR} y1={pricePane.top + pricePane.h * r} y2={pricePane.top + pricePane.h * r} stroke={C.grid} />
          <text x={W - MR + 4} y={pricePane.top + pricePane.h * r + 3} fontSize={9} fill={C.text}>
            {axis(hi - (hi - lo) * r, (hi - lo) / 5)}
          </text>
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        {/* intraday time windows the rule uses */}
        {preview.intraday &&
          st.timeWindows.map((w) =>
            s.candles.slice(first, last + 1).map((c, k) => {
              const i = first + k;
              const m = istMinute(c.time);
              return m >= w.startMinute && m < w.endMinute && shown(i) ? <rect key={`${w.label}-${i}`} x={x(i) - slot / 2} width={slot} y={pricePane.top} height={pricePane.h} fill={C.entry} opacity={0.05} /> : null;
            }),
          )}

        {/* day dividers (intraday): makes overnight gaps obvious — a new session starts here */}
        {preview.intraday &&
          Array.from({ length: last - first }, (_, k) => first + k + 1)
            .filter((i) => shown(i) && Math.floor((s.candles[i].time + 19_800) / 86_400) !== Math.floor((s.candles[i - 1].time + 19_800) / 86_400))
            .map((i) => (
              <g key={`day-${i}`}>
                <line x1={x(i) - slot / 2} x2={x(i) - slot / 2} y1={pricePane.top} y2={axisTop - GAP} stroke="rgba(14,27,45,0.28)" strokeDasharray="3 4" />
                <text x={x(i) - slot / 2 + 4} y={pricePane.top + 12} fontSize={9} fontWeight={700} fill="rgba(14,27,45,0.5)">
                  {new Date(s.candles[i].time * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · new day
                </text>
              </g>
            ))}

        {/* signal column, fading in with a pulse while the rule is checked */}
        {f.atSignal && (
          <g>
            <rect x={x(s.signalIdx) - slot / 2 - 1} width={slot + 2} y={pricePane.top} height={axisTop - pricePane.top - GAP} fill={C.signal} opacity={0.2 * easeOut(signalIn)} rx={3} />
            {signalPulse >= 0 && (
              <circle cx={x(s.signalIdx)} cy={py(s.candles[s.signalIdx].high) - 6} r={4 + 16 * signalPulse} fill="none" stroke={C.signal} strokeWidth={2} opacity={0.9 * (1 - signalPulse)} />
            )}
          </g>
        )}

        {/* made-up part of an illustration */}
        {s.syntheticFrom !== null && visible > s.syntheticFrom && (
          <g>
            <rect x={x(s.syntheticFrom) - slot / 2} width={Math.max(0, W - MR - (x(s.syntheticFrom) - slot / 2))} y={pricePane.top} height={pricePane.h} fill={`url(#${clipId}-hatch)`} opacity={0.5} />
            <text x={x(s.syntheticFrom) + 4} y={pricePane.top + pricePane.h - 6} fontSize={9} fill={C.text}>
              illustration
            </text>
          </g>
        )}

        {/* zones (flash on the one that was hit) */}
        {zone(s.target, C.tp, s.kind === "target" && f.exited ? 1 - exitP : 0)}
        {zone(s.stopLoss, C.sl, s.kind === "stop_loss" && f.exited ? 1 - exitP : 0)}

        {/* fixed price levels from the rules */}
        {st.priceLevels.filter((l) => l.value > lo && l.value < hi).map((l) => (
          <g key={l.label}>
            <line x1={ML} x2={W - MR} y1={py(l.value)} y2={py(l.value)} stroke={C.text} strokeDasharray="2 4" />
            <text x={ML + 4} y={py(l.value) - 3} fontSize={9} fill={C.text}>
              {l.label}
            </text>
          </g>
        ))}

        {/* indicator overlays */}
        {st.overlays.map((o, k) => (
          <path key={o.label} d={linePath(o.values, py)} fill="none" stroke={LINE_COLORS[k % LINE_COLORS.length]} strokeWidth={o.entry ? 1.9 : 1.4} opacity={0.9} strokeLinejoin="round" />
        ))}

        {/* candles */}
        {Array.from({ length: last - first + 1 }, (_, k) => first + k).filter(shown).map(candleBody)}

        {/* patterns: earlier catches faint, the one that triggered drawn in */}
        {markers.map(({ m, local, full }) => {
          const color = MARKER_COLOR[m.family];
          const isSignal = local === s.signalIdx;
          const p = isSignal ? clamp01(f.sinceSignal / 1100) : 1;
          if (m.family === "CANDLE_PATTERN") {
            const from = Math.max(0, local - m.span + 1);
            const top = py(Math.max(...s.candles.slice(from, local + 1).map((c) => c.high))) - 5;
            const bottom = py(Math.min(...s.candles.slice(from, local + 1).map((c) => c.low))) + 5;
            const left = x(from) - slot / 2 - 2;
            const w = slot * (local - from + 1) + 4;
            const perim = 2 * (w + (bottom - top));
            return (
              <g key={`${m.label}-${full}`} opacity={isSignal ? 1 : 0.4}>
                {isSignal && <rect x={left} y={top} width={w} height={bottom - top} rx={5} fill={color} opacity={0.08 * easeOut(p)} />}
                <rect x={left} y={top} width={w} height={bottom - top} rx={5} fill="none" stroke={color} strokeWidth={isSignal ? 2 : 1} strokeDasharray={isSignal ? perim : undefined} strokeDashoffset={isSignal ? perim * (1 - easeOut(p)) : undefined} />
                {isSignal && (
                  <text x={left} y={top - 7 - 6 * (1 - easeOut(p))} opacity={easeOut(p) * fadeAfterEntry} textAnchor="start" fontSize={10.5} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                    Caught here: {m.label}
                  </text>
                )}
              </g>
            );
          }
          const shape = m.shapes[full];
          const c = s.candles[local];
          return (
            <g key={`${m.label}-${full}`} opacity={isSignal ? 1 : 0.4}>
              {isSignal && shape && shapeLayer(shape, color, "price", p)}
              {m.family === "CHART_PATTERN" && (
                <g opacity={isSignal ? easeOut(p) : 1}>
                  <path d={`M${x(local)},${py(c.high) - 12 - 6 * (1 - easeOut(p))}l-5,-7h10z`} fill={color} />
                  {isSignal && fadeAfterEntry > 0 && (
                    <text opacity={fadeAfterEntry} x={x(local) - slot / 2} y={py(c.high) - 24} textAnchor="start" fontSize={10.5} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                      Caught here: {m.label}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* trailing stop: glow + staircase + "moved" tags */}
        {trailD && (
          <g>
            <path d={trailD} fill="none" stroke={C.trail} strokeWidth={5} opacity={0.25} filter={`url(#${clipId}-glow)`} />
            <path d={trailD} fill="none" stroke={C.trail} strokeWidth={2.2} strokeLinejoin="round" />
            {trailSteps
              .filter((t) => t.moved)
              .map((t) => {
                const age = f.ms - f.barShownAt(t.i);
                if (age < 0 || age > 1100) return null;
                const k = age / 1100;
                return (
                  <g key={t.i} opacity={1 - k}>
                    <circle cx={t.x1} cy={t.y} r={3 + 5 * k} fill="none" stroke={C.trail} strokeWidth={1.5} />
                    <text x={t.x2 + 3} y={t.y + (preview.direction === "SHORT" ? -6 : 13) - 6 * k} fontSize={9.5} fontWeight={700} fill={C.trail} stroke="white" strokeWidth={3} paintOrder="stroke">
                      {preview.direction === "SHORT" ? "↓" : "↑"} {inr(t.v)}
                    </text>
                  </g>
                );
              })}
          </g>
        )}

        {/* entry: marker drops in with a ripple */}
        {inTrade && (
          <g>
            <circle cx={entryX} cy={py(s.entryPrice)} r={6 + 20 * entryP} fill="none" stroke={C.entry} strokeWidth={2} opacity={0.8 * (1 - entryP)} />
            <circle cx={entryX} cy={py(s.entryPrice) - 22 * (1 - easeOutBack(entryP))} r={5.5} fill={C.entry} stroke="white" strokeWidth={1.6} opacity={easeOut(entryP * 1.5)} />
            <text x={entryX} y={py(s.entryPrice) + (preview.direction === "SHORT" ? -11 : 19)} textAnchor="middle" fontSize={10} fontWeight={800} fill={C.entry} stroke="white" strokeWidth={3} paintOrder="stroke" opacity={easeOut(entryP)}>
              {preview.direction === "SHORT" ? "SELL" : "BUY"}
            </text>
          </g>
        )}

        {/* exit: double shockwave, the path of the trade, and a sliding label */}
        {f.exited && (
          <g>
            <line x1={entryX} y1={py(s.entryPrice)} x2={entryX + (ex - entryX) * easeOut(exitP * 1.4)} y2={py(s.entryPrice) + (ey - py(s.entryPrice)) * easeOut(exitP * 1.4)} stroke={exitColor} strokeWidth={1.3} strokeDasharray="3 3" />
            {[0, 0.22].map((d) => {
              const k = clamp01((exitP - d) / (1 - d));
              return k > 0 && k < 1 ? <circle key={d} cx={ex} cy={ey} r={6 + 28 * easeOut(k)} fill="none" stroke={exitColor} strokeWidth={2.4 * (1 - k) + 0.5} opacity={1 - k} /> : null;
            })}
            <circle cx={ex} cy={ey} r={6.5 * easeOutBack(clamp01(exitP * 2))} fill={exitColor} stroke="white" strokeWidth={1.8} />
            <text x={ex} y={ey + (s.pnlPct >= 0 === (preview.direction !== "SHORT") ? -13 : 21) + 8 * (1 - easeOut(exitP * 1.6))} opacity={easeOut(exitP * 1.6)} textAnchor="end" fontSize={11} fontWeight={800} fill={exitColor} stroke="white" strokeWidth={3.5} paintOrder="stroke">
              {EXIT_TEXT[s.kind]} {s.pnlPct >= 0 ? "+" : ""}
              {s.pnlPct.toFixed(2)}%
            </text>
          </g>
        )}

        {/* signal dots on the price-chart lines the entry rule uses */}
        {f.atSignal &&
          st.overlays
            .filter((o) => o.entry)
            .map((o) => {
              const v = at(o.values, s.signalIdx);
              const r = 4 + (signalPulse >= 0 ? 2 * Math.sin(signalPulse * Math.PI) : 0);
              return v === null ? null : <circle key={o.label} cx={x(s.signalIdx)} cy={py(v)} r={r * easeOutBack(signalIn)} fill="white" stroke={C.signal} strokeWidth={2.6} />;
            })}

        {/* volume */}
        {volPane && (() => {
          const y = paneY("volume")!;
          const vmarks = new Set(markers.filter((h) => h.m.family === "VOLUME_PATTERN").map((h) => h.local));
          const bw = Math.max(2, slot * 0.66);
          return (
            <g>
              {Array.from({ length: last - first + 1 }, (_, k) => first + k)
                .filter(shown)
                .map((i) => {
                  const c = s.candles[i];
                  const g = i === visible ? easeOut(frac) : 1;
                  const isSig = vmarks.has(i) && i === s.signalIdx;
                  const fullH = volPane.top + volPane.h - y(c.volume);
                  const vh = (i === s.signalIdx ? volRegrow(fullH, volPane.top + volPane.h - y(volAvg)) : fullH) * g;
                  return (
                    <g key={c.time}>
                      {isSig && <rect x={x(i) - bw / 2 - 2} width={bw + 4} y={volPane.top + volPane.h - vh - 2} height={vh + 2} rx={2} fill="#ea580c" opacity={0.35 * easeOut(signalIn)} filter={`url(#${clipId}-glow)`} />}
                      <rect x={x(i) - bw / 2} width={bw} y={volPane.top + volPane.h - vh} height={vh} rx={1} fill={vmarks.has(i) ? "#ea580c" : c.close >= c.open ? C.up : C.down} opacity={vmarks.has(i) ? 0.95 : 0.35} />
                    </g>
                  );
                })}
              {st.volume.lines.map((l) => (
                <path key={l.label} d={linePath(l.values, y)} fill="none" stroke="#ea580c" strokeWidth={1.2} strokeDasharray="4 3" />
              ))}
              {markers
                .filter((h) => h.m.family === "VOLUME_PATTERN" && h.local === s.signalIdx)
                .map((h) => (
                  <g key={h.m.label}>
                    {h.m.shapes[h.full] && shapeLayer(h.m.shapes[h.full], "#ea580c", "volume", clamp01(f.sinceSignal / 1100))}
                    <text x={x(h.local) - slot / 2} y={volPane.top + 12} textAnchor="start" fontSize={10} fontWeight={700} fill="#ea580c" stroke="white" strokeWidth={3} paintOrder="stroke" opacity={easeOut(signalIn) * fadeAfterEntry}>
                      Caught here: {h.m.label}
                    </text>
                  </g>
                ))}
            </g>
          );
        })()}

        {/* oscillators with the thresholds the rules use */}
        {oscPanes.map((p) => {
          const y = paneY(p.key)!;
          return (
            <g key={p.key}>
              {p.osc.levels.map((lv) => (
                <line key={lv} x1={ML} x2={W - MR} y1={y(lv)} y2={y(lv)} stroke={C.text} strokeDasharray="3 3" />
              ))}
              {p.osc.lines.map((l, k) => (
                <path key={l.label} d={linePath(l.values, y)} fill="none" stroke={LINE_COLORS[(k + 2) % LINE_COLORS.length]} strokeWidth={1.6} strokeLinejoin="round" />
              ))}
              {markers
                .filter((h) => h.local === s.signalIdx && h.m.shapes[h.full])
                .map((h) => (
                  <g key={h.m.label}>{shapeLayer(h.m.shapes[h.full], "#ea580c", p.key, clamp01(f.sinceSignal / 1100))}</g>
                ))}
              {f.atSignal &&
                p.osc.lines
                  .filter((l) => l.entry)
                  .map((l) => {
                    const v = at(l.values, s.signalIdx);
                    const r = 4 + (signalPulse >= 0 ? 2 * Math.sin(signalPulse * Math.PI) : 0);
                    return v === null ? null : <circle key={l.label} cx={x(s.signalIdx)} cy={y(v)} r={r * easeOutBack(signalIn)} fill="white" stroke={C.signal} strokeWidth={2.6} />;
                  })}
            </g>
          );
        })}

        {/* spotlight: the rest of the chart steps back while the camera is zoomed in */}
        {zoom > 0.01 && (
          <g fill="white" opacity={0.5 * zoom} pointerEvents="none">
            <rect x={ML} y={pricePane.top} width={Math.max(0, x(spotFrom) - slot / 2 - 3 - ML)} height={axisTop - GAP - pricePane.top} />
          </g>
        )}

        {/* the moment of detection, drawn for its kind */}
        {oscZones.map((z) => (
          <polygon key={z.key} points={z.d} fill={C.signal} opacity={(0.1 + 0.25 * fadeAfterEntry) * easeOut(signalIn)} />
        ))}
        {crosses.length === 0 && oscZones.slice(0, 1).map((z) => tag(x(s.signalIdx) - 8, z.ly - 4, "#8a7437", z.text, easeOut(signalIn) * fadeAfterEntry, "end"))}
        {candleMoments}
        {chartMoments}
        {volumeMoment}
        {crosses.map((c) => (
          <g key={c.text}>
            {burst(c.x, c.y, C.signal, 250)}
            {tag(c.x - 6, c.y - 12, "#8a7437", c.text, easeOut((sinceSig - 350) / 350) * fadeAfterEntry, "end")}
          </g>
        ))}
        {valueTags.map((v, k) => {
          const v1 = at(v.values, s.signalIdx);
          if (v1 === null) return null;
          const v0 = s.signalIdx > 0 ? at(v.values, s.signalIdx - 1) : null;
          const now = v0 === null ? v1 : v0 + (v1 - v0) * countUp;
          return <g key={`vt-${v.label}`}>{tag(x(s.signalIdx) + 10, v.y(v1) + 3.5 + (k % 2) * 11, v.color, `${v.label} ${num(now)}`, easeOut(signalIn) * fadeAfterEntry, "start")}</g>;
        })}
      </g>

      {/* labels that sit outside the clipped plot */}
      {volPane && (
        <text x={ML + 5} y={volPane.top + 11} fontSize={9} fill={C.text}>
          Volume
        </text>
      )}
      {oscPanes.map((p) => {
        const y = paneY(p.key)!;
        return (
          <g key={p.key}>
            <text x={ML + 5} y={p.top + 11} fontSize={9} fill={C.text}>
              {p.osc.lines.map((l) => l.label).join(" · ")}
            </text>
            {p.osc.levels.map((lv) => (
              <text key={lv} x={W - MR + 4} y={y(lv) + 3} fontSize={9} fill={C.text}>
                {lv}
              </text>
            ))}
          </g>
        );
      })}

      {/* entry, take-profit, stop-loss (labels on the price axis; far-off levels pinned to the edge) */}
      {levelLine(s.target, C.tp, "TP")}
      {levelLine(s.stopLoss, C.sl, "SL")}
      {levelLine(s.entryPrice, C.entry, "Entry")}
      {trailNow !== null && inTrade && !f.exited && (
        <g>
          <rect x={W - MR + 2} y={pyClamped(trailNow) - 8} width={MR - 4} height={16} rx={5} fill={C.trail} />
          <text x={W - MR / 2} y={pyClamped(trailNow) + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="white">
            Trail {trailNow.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </text>
        </g>
      )}

      {/* time axis for what's on screen */}
      {tickIdx.map((i, k) => (
        <text key={k} x={Math.min(W - MR - 2, Math.max(ML + 2, x(i)))} y={axisTop + 13} textAnchor={k === 0 ? "start" : k === tickIdx.length - 1 ? "end" : "middle"} fontSize={9} fill={C.text}>
          {when(s.candles[i].time, preview.intraday)}
        </text>
      ))}

      {/* overview: whole window, the visible part, entry and exit */}
      {n > viewN && (
        <g>
          <rect x={ML} y={ovTop} width={plotW} height={OVERVIEW_H - 4} rx={4} fill="rgba(14,27,45,0.03)" />
          <polyline points={pts(closes.slice(0, Math.max(1, visible)).map((v, i) => [ovX(i), ovY(v)]))} fill="none" stroke="rgba(14,27,45,0.35)" strokeWidth={1} />
          <rect x={ovX(cam)} y={ovTop} width={(viewN / Math.max(1, n - 1)) * plotW} height={OVERVIEW_H - 4} rx={4} fill={C.entry} opacity={0.1} stroke={C.entry} strokeOpacity={0.35} />
          {inTrade && <circle cx={ovX(s.entryIdx)} cy={ovY(closes[s.entryIdx])} r={2.5} fill={C.entry} />}
          {f.exited && <circle cx={ovX(s.exitIdx)} cy={ovY(closes[s.exitIdx])} r={2.5} fill={exitColor} />}
        </g>
      )}
    </svg>
  );
}
