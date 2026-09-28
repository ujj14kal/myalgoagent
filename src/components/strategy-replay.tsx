"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const PRICE_H = 250;
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

function timeline(s: Scenario): Timeline {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const pre = clamp((s.signalIdx + 1) * 70, 1200, 2800);
  const signal = 900 + s.checks.length * 500;
  const entry = 1100;
  const trade = clamp((s.exitIdx - s.entryIdx + 1) * 260, 1800, 7000);
  const exit = 1800;
  const post = (s.candles.length - 1 - s.exitIdx) * 90;
  return { pre, signal, entry, trade, exit, post, total: pre + signal + entry + trade + exit + post };
}

/** How far the animation has got, at `ms` into the timeline. */
function frameAt(s: Scenario, tl: Timeline, ms: number) {
  const t1 = tl.pre;
  const t2 = t1 + tl.signal;
  const t3 = t2 + tl.entry;
  const t4 = t3 + tl.trade;
  const t5 = t4 + tl.exit;
  let bars: number;
  if (ms < t1) bars = ((ms / tl.pre) * (s.signalIdx + 1));
  else if (ms < t3) bars = s.signalIdx + 1;
  else if (ms < t4) bars = s.entryIdx + 1 + ((ms - t3) / tl.trade) * (s.exitIdx - s.entryIdx);
  else if (ms < t5) bars = s.exitIdx + 1;
  else bars = s.exitIdx + 1 + (tl.post ? ((ms - t5) / tl.post) * (s.candles.length - 1 - s.exitIdx) : 0);
  const checksShown = ms < t1 ? 0 : Math.min(s.checks.length, Math.floor((ms - t1 - 500) / 500) + 1);
  return {
    bars: Math.min(s.candles.length, bars),
    atSignal: ms >= t1,
    checksShown: Math.max(0, checksShown),
    entryProgress: ms < t2 ? 0 : Math.min(1, (ms - t2) / tl.entry),
    exited: ms >= t4,
    done: ms >= tl.total,
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
  const tl = useMemo(() => timeline(s), [s]);
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

function ReplayChart({ preview, s, f }: { preview: StrategyPreview; s: Scenario; f: Frame }) {
  const st = preview.studies;
  const n = s.candles.length;
  const slot = (W - ML - MR) / n;
  const x = (i: number) => ML + slot * (i + 0.5);
  const visible = Math.floor(f.bars);
  const src = (i: number) => s.sourceIdx[i];
  /** A study value for scenario bar i (made-up bars have none). */
  const at = (values: (number | null)[], i: number) => {
    const k = src(i);
    return k === null || k === undefined ? null : values[k];
  };
  const toLocal = (full: number) => {
    const i = s.sourceIdx.indexOf(full);
    return i === -1 ? null : i;
  };

  // Pane layout.
  const oscs = st.oscillators.slice(0, 2);
  const pricePane = { top: 6, h: PRICE_H };
  const volTop = pricePane.top + PRICE_H + GAP;
  const volPane = st.volume.show ? { top: volTop, h: VOL_H } : null;
  const oscTop = volTop + (volPane ? VOL_H + GAP : 0);
  const oscPanes = oscs.map((o, k) => ({ key: o.key, top: oscTop + k * (OSC_H + GAP), h: OSC_H, osc: o }));
  const H = oscTop + oscs.length * (OSC_H + GAP) + AXIS_H;

  // Price scale covers everything that will be drawn, so it never jumps mid-replay.
  const lows = s.candles.map((c) => c.low);
  const highs = s.candles.map((c) => c.high);
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  const range = hi - lo || hi * 0.01;
  const within = (v: number | null) => v !== null && v > lo - range * 0.35 && v < hi + range * 0.35;
  for (const v of [s.entryPrice, s.exitPrice, s.stopLoss, s.target, ...(s.trailing ?? [])]) if (v !== null && Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  for (const o of st.overlays) for (let i = 0; i < n; i++) {
    const v = at(o.values, i);
    if (within(v)) [lo, hi] = [Math.min(lo, v!), Math.max(hi, v!)];
  }
  for (const l of st.priceLevels) if (within(l.value)) [lo, hi] = [Math.min(lo, l.value), Math.max(hi, l.value)];
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const py = (v: number) => pricePane.top + ((hi - v) / (hi - lo)) * pricePane.h;

  const paneY = (pane: string): ((v: number) => number) | null => {
    if (pane === "price") return py;
    if (pane === "volume" && volPane) {
      const vmax = Math.max(...s.candles.map((c) => c.volume), 1);
      return (v) => volPane.top + volPane.h - (v / vmax) * volPane.h;
    }
    const p = oscPanes.find((o) => o.key === pane);
    if (!p) return null;
    const vals = p.osc.lines.flatMap((l) => s.candles.map((_, i) => at(l.values, i))).filter((v): v is number => v !== null);
    const all = [...vals, ...p.osc.levels];
    let a = Math.min(...all);
    let b = Math.max(...all);
    if (a === b) [a, b] = [a - 1, b + 1];
    const m = (b - a) * 0.1;
    return (v) => p.top + ((b + m - v) / (b - a + 2 * m)) * p.h;
  };

  const path = (values: (number | null)[], y: (v: number) => number, upto: number) => {
    let d = "";
    let pen = false;
    for (let i = 0; i < Math.min(upto, n); i++) {
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

  const entryX = x(s.entryIdx);
  const lineEnd = f.exited ? x(s.exitIdx) : x(Math.max(s.entryIdx, visible - 1));
  const drawTo = lineEnd; // entry / TP / SL lines extend with the trade
  const reveal = f.entryProgress; // 0..1 fade/draw-in of the entry, TP and SL lines
  const levelLine = (v: number | null, color: string, label: string) =>
    v === null || reveal === 0 ? null : (
      <g key={label} opacity={reveal}>
        <line x1={x(s.signalIdx)} x2={Math.max(drawTo, entryX + 40)} y1={py(v)} y2={py(v)} stroke={color} strokeWidth={1.6} strokeDasharray="6 4" />
        <rect x={W - MR + 2} y={py(v) - 8} width={MR - 4} height={16} rx={4} fill={color} />
        <text x={W - MR / 2} y={py(v) + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="white">
          {label}
        </text>
      </g>
    );

  // Zones between entry and target / stop, like a trading ticket.
  const zone = (from: number, to: number | null, color: string) =>
    to === null || reveal === 0 ? null : (
      <rect x={entryX} width={Math.max(0, drawTo - entryX)} y={Math.min(py(from), py(to))} height={Math.abs(py(from) - py(to))} fill={color} opacity={0.07 * reveal} />
    );

  const trailPath = s.trailing
    ? (() => {
        let d = "";
        const until = f.exited ? s.exitIdx : Math.min(visible - 1, s.exitIdx);
        for (let i = s.entryIdx; i <= until; i++) {
          const v = s.trailing![i - s.entryIdx];
          if (v === null || v === undefined) continue;
          const xl = x(i) - slot / 2;
          const xr = x(i) + slot / 2;
          d += `${d ? "L" : "M"}${xl.toFixed(1)},${py(v).toFixed(1)}L${xr.toFixed(1)},${py(v).toFixed(1)}`;
        }
        return d;
      })()
    : "";

  const markersInView = st.markers.flatMap((m) =>
    m.bars
      .map((b) => ({ m, local: toLocal(b), full: b }))
      .filter((h): h is { m: typeof m; local: number; full: number } => h.local !== null && h.local < visible),
  );

  const shapeLines = (shape: ReplayShape, color: string) =>
    shape.lines.map((l, k) => {
      const y = paneY(l.pane);
      const pts = l.pts.map(([fi, v]) => [toLocal(fi), v] as const).filter(([li]) => li !== null) as [number, number][];
      if (!y || pts.length < 2) return null;
      return (
        <polyline
          key={k}
          points={pts.map(([li, v]) => `${x(li).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={l.style === "shape" ? 2 : 1.4}
          strokeDasharray={l.style === "shape" ? undefined : "5 4"}
          strokeLinejoin="round"
          opacity={0.9}
        />
      );
    });

  const ticks = Math.min(6, n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`Replay of a ${SCENARIO_TITLE[s.kind].toLowerCase()} trade on ${preview.symbol}`}>
      {/* grid + pane frames */}
      {[pricePane, volPane, ...oscPanes].filter(Boolean).map((p, k) => (
        <rect key={k} x={ML} y={p!.top} width={W - ML - MR} height={p!.h} fill="none" stroke={C.grid} />
      ))}
      {[0.25, 0.5, 0.75].map((r) => (
        <g key={r}>
          <line x1={ML} x2={W - MR} y1={pricePane.top + pricePane.h * r} y2={pricePane.top + pricePane.h * r} stroke={C.grid} />
          <text x={W - MR + 4} y={pricePane.top + pricePane.h * r + 3} fontSize={9} fill={C.text}>
            {axis(hi - (hi - lo) * r, (hi - lo) / 4)}
          </text>
        </g>
      ))}

      {/* intraday time windows the rule uses */}
      {preview.intraday &&
        st.timeWindows.map((w) =>
          s.candles.map((c, i) => {
            const m = istMinute(c.time);
            return m >= w.startMinute && m < w.endMinute && i < visible ? <rect key={`${w.label}-${i}`} x={x(i) - slot / 2} width={slot} y={pricePane.top} height={pricePane.h} fill={C.entry} opacity={0.05} /> : null;
          }),
        )}

      {/* signal candle highlight */}
      {f.atSignal && <rect x={x(s.signalIdx) - slot / 2 - 1} width={slot + 2} y={pricePane.top} height={H - AXIS_H - pricePane.top} fill={C.signal} opacity={0.18} rx={2} />}

      {/* made-up part of an illustration */}
      {s.syntheticFrom !== null && visible > s.syntheticFrom && (
        <g>
          <rect x={x(s.syntheticFrom) - slot / 2} width={W - MR - (x(s.syntheticFrom) - slot / 2)} y={pricePane.top} height={pricePane.h} fill="url(#hatch)" opacity={0.5} />
          <text x={x(s.syntheticFrom) + 4} y={pricePane.top + pricePane.h - 6} fontSize={9} fill={C.text}>
            illustration
          </text>
        </g>
      )}
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(14,27,45,0.06)" strokeWidth="3" />
        </pattern>
      </defs>

      {/* zones + levels */}
      {zone(s.entryPrice, s.target, C.tp)}
      {zone(s.entryPrice, s.stopLoss, C.sl)}

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
        <path key={o.label} d={path(o.values, py, visible)} fill="none" stroke={LINE_COLORS[k % LINE_COLORS.length]} strokeWidth={1.5} opacity={0.9} />
      ))}

      {/* candles */}
      {s.candles.slice(0, visible).map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? C.up : C.down;
        const bw = Math.max(1.5, slot * 0.62);
        const top = py(Math.max(c.open, c.close));
        const bh = Math.max(1, Math.abs(py(c.open) - py(c.close)));
        const synthetic = s.syntheticFrom !== null && i >= s.syntheticFrom;
        return (
          <g key={c.time} opacity={synthetic ? 0.75 : 1}>
            <line x1={x(i)} x2={x(i)} y1={py(c.high)} y2={py(c.low)} stroke={color} strokeWidth={1} />
            <rect x={x(i) - bw / 2} y={top} width={bw} height={bh} fill={up ? "white" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}

      {/* pattern markers, each with its own geometry */}
      {markersInView.map(({ m, local, full }) => {
        const color = MARKER_COLOR[m.family];
        const isSignal = local === s.signalIdx;
        const shape = m.shapes[full];
        const c = s.candles[local];
        if (m.family === "CANDLE_PATTERN") {
          const from = Math.max(0, local - m.span + 1);
          const top = py(Math.max(...s.candles.slice(from, local + 1).map((k) => k.high)));
          const bottom = py(Math.min(...s.candles.slice(from, local + 1).map((k) => k.low)));
          return (
            <g key={`${m.label}-${full}`} opacity={isSignal ? 1 : 0.55}>
              <rect x={x(from) - slot / 2 - 1.5} width={slot * m.span + 3} y={top - 4} height={bottom - top + 8} rx={4} fill="none" stroke={color} strokeWidth={isSignal ? 1.8 : 1} />
              {isSignal && (
                <text x={x(local)} y={top - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                  Caught here: {m.label}
                </text>
              )}
            </g>
          );
        }
        return (
          <g key={`${m.label}-${full}`} opacity={isSignal ? 1 : 0.45}>
            {isSignal && shape && shapeLines(shape, color)}
            {isSignal &&
              shape?.points.map((p) => {
                const li = toLocal(p.idx);
                const y = paneY(p.pane);
                return li === null || !y ? null : (
                  <g key={`${p.label}-${p.idx}`}>
                    <circle cx={x(li)} cy={y(p.value)} r={3} fill={color} />
                    <text x={x(li)} y={y(p.value) - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                      {p.label}
                    </text>
                  </g>
                );
              })}
            {m.family === "CHART_PATTERN" && (
              <g>
                <path d={`M${x(local)},${py(c.high) - 16}l-4,-6h8z`} fill={color} />
                {isSignal && (
                  <text x={x(local)} y={py(c.high) - 26} textAnchor="middle" fontSize={10} fontWeight={700} fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
                    Caught here: {m.label}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* entry, take-profit, stop-loss */}
      {levelLine(s.target, C.tp, "TP")}
      {levelLine(s.stopLoss, C.sl, "SL")}
      {levelLine(s.entryPrice, C.entry, "Entry")}
      {s.trailing && trailPath && <path d={trailPath} fill="none" stroke={C.trail} strokeWidth={2} />}

      {/* entry and exit markers */}
      {reveal > 0 && (
        <g opacity={reveal}>
          <circle cx={entryX} cy={py(s.entryPrice)} r={5 + 5 * (1 - reveal)} fill={C.entry} stroke="white" strokeWidth={1.5} />
          <text x={entryX} y={py(s.entryPrice) + (preview.direction === "SHORT" ? -10 : 17)} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={C.entry} stroke="white" strokeWidth={3} paintOrder="stroke">
            {preview.direction === "SHORT" ? "SELL" : "BUY"}
          </text>
        </g>
      )}
      {f.exited && (
        <g>
          <circle cx={x(s.exitIdx)} cy={py(s.exitPrice)} r={6} fill={KIND_COLOR[s.kind]} stroke="white" strokeWidth={1.5} />
          <line x1={entryX} y1={py(s.entryPrice)} x2={x(s.exitIdx)} y2={py(s.exitPrice)} stroke={KIND_COLOR[s.kind]} strokeWidth={1} strokeDasharray="2 3" />
          <text x={x(s.exitIdx)} y={py(s.exitPrice) + (s.pnlPct >= 0 === (preview.direction !== "SHORT") ? -11 : 18)} textAnchor="middle" fontSize={10} fontWeight={700} fill={KIND_COLOR[s.kind]}>
            {EXIT_TEXT[s.kind]}
          </text>
        </g>
      )}

      {/* volume */}
      {volPane && (() => {
        const y = paneY("volume")!;
        const vmarks = new Set(markersInView.filter((h) => h.m.family === "VOLUME_PATTERN").map((h) => h.local));
        return (
          <g>
            <text x={ML + 4} y={volPane.top + 11} fontSize={9} fill={C.text}>
              Volume
            </text>
            {s.candles.slice(0, visible).map((c, i) => (
              <rect
                key={c.time}
                x={x(i) - Math.max(1, slot * 0.62) / 2}
                width={Math.max(1, slot * 0.62)}
                y={y(c.volume)}
                height={volPane.top + volPane.h - y(c.volume)}
                fill={vmarks.has(i) ? "#ea580c" : c.close >= c.open ? C.up : C.down}
                opacity={vmarks.has(i) ? 0.95 : 0.35}
              />
            ))}
            {st.volume.lines.map((l) => (
              <path key={l.label} d={path(l.values, y, visible)} fill="none" stroke="#ea580c" strokeWidth={1.2} strokeDasharray="4 3" />
            ))}
            {markersInView
              .filter((h) => h.m.family === "VOLUME_PATTERN" && h.local === s.signalIdx)
              .map((h) => (
                <text key={h.m.label} x={x(h.local)} y={volPane.top + 11} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#ea580c" stroke="white" strokeWidth={3} paintOrder="stroke">
                  Caught here: {h.m.label}
                </text>
              ))}
          </g>
        );
      })()}

      {/* oscillators with the thresholds the rules use */}
      {oscPanes.map((p) => {
        const y = paneY(p.key)!;
        return (
          <g key={p.key}>
            <text x={ML + 4} y={p.top + 11} fontSize={9} fill={C.text}>
              {p.osc.lines.map((l) => l.label).join(" · ")}
            </text>
            {p.osc.levels.map((lv) => (
              <g key={lv}>
                <line x1={ML} x2={W - MR} y1={y(lv)} y2={y(lv)} stroke={C.text} strokeDasharray="3 3" />
                <text x={W - MR + 4} y={y(lv) + 3} fontSize={9} fill={C.text}>
                  {lv}
                </text>
              </g>
            ))}
            {p.osc.lines.map((l, k) => (
              <path key={l.label} d={path(l.values, y, visible)} fill="none" stroke={LINE_COLORS[(k + 2) % LINE_COLORS.length]} strokeWidth={1.5} />
            ))}
            {markersInView
              .filter((h) => h.local === s.signalIdx && h.m.shapes[h.full])
              .map((h) => (
                <g key={h.m.label}>{shapeLines({ ...h.m.shapes[h.full], lines: h.m.shapes[h.full].lines.filter((l) => l.pane === p.key) }, "#ea580c")}</g>
              ))}
            {f.atSignal &&
              p.osc.lines
                .filter((l) => l.entry)
                .map((l) => {
                  const v = at(l.values, s.signalIdx);
                  return v === null ? null : <circle key={l.label} cx={x(s.signalIdx)} cy={y(v)} r={4} fill="white" stroke={C.signal} strokeWidth={2.5} />;
                })}
          </g>
        );
      })}

      {/* signal dots on the price-chart lines the entry rule uses */}
      {f.atSignal &&
        st.overlays
          .filter((o) => o.entry)
          .map((o) => {
            const v = at(o.values, s.signalIdx);
            return v === null ? null : <circle key={o.label} cx={x(s.signalIdx)} cy={py(v)} r={4} fill="white" stroke={C.signal} strokeWidth={2.5} />;
          })}

      {/* time axis */}
      {Array.from({ length: ticks }, (_, k) => {
        const i = Math.round((k / Math.max(1, ticks - 1)) * (n - 1));
        return (
          <text key={k} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === ticks - 1 ? "end" : "middle"} fontSize={9} fill={C.text}>
            {when(s.candles[i].time, preview.intraday)}
          </text>
        );
      })}
    </svg>
  );
}
