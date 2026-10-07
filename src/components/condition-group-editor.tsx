"use client";
import InstrumentCombobox from "@/components/instrument-combobox";
import { useCustomIndicators } from "@/components/custom-indicators/context";
import { customParts, defaultPart, describeCustom, PART_LABEL, type CustomPart } from "@/lib/custom-indicator";

import { createContext, useContext, useState } from "react";
import type { ComparisonOperator, ConditionNode, IndicatorKind, Operand, PriceField } from "@/lib/strategy";
import { INDICATOR_CATALOG, INDICATOR_BY_KIND, operandsScaleCompatible } from "@/lib/strategy/indicator-catalog";
import { CANDLE_PATTERN_CATALOG } from "@/lib/strategy/candle-pattern-catalog";
import { CHART_PATTERN_CATALOG } from "@/lib/strategy/chart-pattern-catalog";
import { VOLUME_PATTERN_CATALOG } from "@/lib/strategy/volume-pattern-catalog";
import { SMC_DEFAULTS, SMC_HELP, SMC_KINDS, SMC_LABEL, type SmcKind, type SmcSide } from "@/lib/smc";
import { INTERVALS, intervalDurationSeconds } from "@/lib/market-data";
import type { CandleInterval } from "@/lib/market-data";
import CandlePatternIllustration from "@/components/candle-pattern-illustration";
import ChartPatternIllustration from "@/components/chart-pattern-illustration";
import VolumePatternIllustration from "@/components/volume-pattern-illustration";
import IndicatorIllustration from "@/components/indicator-illustration";
import TimeWindowStrip from "@/components/time-window-strip";

export interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

const PRICE_FIELDS: { value: PriceField; label: string }[] = [
  { value: "CLOSE", label: "Close price" },
  { value: "OPEN", label: "Open price" },
  { value: "HIGH", label: "High price" },
  { value: "LOW", label: "Low price" },
  { value: "VOLUME", label: "Volume" },
];

const OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: "CROSSES_ABOVE", label: "crosses above" },
  { value: "CROSSES_BELOW", label: "crosses below" },
  { value: "GT", label: "is greater than" },
  { value: "LT", label: "is less than" },
  { value: "GTE", label: "is greater than or equal to" },
  { value: "LTE", label: "is less than or equal to" },
  { value: "EQ", label: "equals" },
];

const inputClass =
  "rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";
const pillButtonClass =
  "rounded-full border px-3 py-1 text-xs font-medium border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary";

function defaultOperand(): Operand {
  return { kind: "price", field: "CLOSE" };
}

/** Filters what the operand picker should offer, given the operand
 * currently on the *other* side of the comparison — computed here rather
 * than left to the user to notice is wrong. Uses `operandsScaleCompatible`
 * directly against each candidate indicator/price field rather than a
 * coarse OSCILLATOR/PRICE_SCALE bucket, so paired oscillators (MACD
 * Line/Signal, Stochastic %K/%D, +DI/-DI, Aroon Up/Down) stay comparable to
 * each other while unrelated oscillators (RSI vs CCI, RSI vs price, ...)
 * don't. */
function isIndicatorAllowed(candidate: IndicatorKind, other: Operand): boolean {
  return operandsScaleCompatible({ kind: "indicator", type: candidate, params: [] }, other);
}

function isPriceAllowed(other: Operand): boolean {
  return operandsScaleCompatible({ kind: "price", field: "CLOSE" }, other);
}

function defaultComparison(): ConditionNode {
  return {
    kind: "comparison",
    left: { kind: "indicator", type: "SMA", params: [20] },
    operator: "CROSSES_ABOVE",
    right: { kind: "indicator", type: "EMA", params: [50] },
  };
}

function defaultTimeWindow(): ConditionNode {
  return { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 9 * 60 + 15, endMinute: 9 * 60 + 30 } };
}

function defaultCandlePattern(): ConditionNode {
  return { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "BULLISH_ENGULFING" } };
}

function defaultChartPattern(): ConditionNode {
  return { kind: "signal", signal: { family: "CHART_PATTERN", pattern: "DOUBLE_BOTTOM" } };
}

function defaultVolumePattern(): ConditionNode {
  return { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } };
}

function defaultSmc(): ConditionNode {
  return { kind: "signal", signal: { family: "SMC", pattern: "BOS", side: "BULLISH" } };
}

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** The strategy's own timeframe — conditions with no timeframe of their own are read on it. */
export const StrategyTimeframeContext = createContext<CandleInterval>("1d");

/**
 * Whether rules may pick their own timeframe / instrument. The strategy builder
 * turns this off: every rule uses the timeframe and instrument chosen in its
 * first section. A rule saved with an override still shows it, with × to clear.
 */
export const ConditionOverridesContext = createContext(true);

/** The exit time set from the entry section's time rule (strategy builder only). */
export const ExitTimeContext = createContext<{ exitMinute: number | null; editable: boolean; setExitMinute: (m: number | null) => void } | null>(null);

function OverrideChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[11px] text-[#6f5a22]">
      {label}
      <button type="button" onClick={onClear} aria-label={`Use the strategy's own ${label.includes("chart") ? "timeframe" : "instrument"}`} className="font-bold hover:text-brand-sell">
        ×
      </button>
    </span>
  );
}

function TimeframeSelect({ value, onChange }: { value: CandleInterval | undefined; onChange: (v: CandleInterval | undefined) => void }) {
  const base = useContext(StrategyTimeframeContext);
  const allowed = useContext(ConditionOverridesContext);
  if (!allowed) return value && value !== base ? <OverrideChip label={`on ${INTERVALS.find((i) => i.value === value)?.label ?? value} chart`} onClear={() => onChange(undefined)} /> : null;
  // No "Same as chart" option: the strategy's own timeframe is shown as what it
  // actually is, and choosing it stores no override (so saved strategies are unchanged).
  return (
    <select
      className={`${inputClass} text-brand-navy/60`}
      value={value ?? base}
      title="Detect on this timeframe"
      onChange={(e) => {
        const v = e.target.value as CandleInterval;
        onChange(v === base ? undefined : v);
      }}
    >
      {INTERVALS.map((iv) => (
        <option key={iv.value} value={iv.value}>
          {iv.label} chart
        </option>
      ))}
    </select>
  );
}

/**
 * A time-based entry: "Enter at 09:20" (the candle that opens then) and,
 * in the strategy builder, "Exit at 15:00" — which sets the exit rule.
 * A window saved as "between A and B" (wider than one candle) is still shown and editable.
 */
function EntryTimeEditor({
  signal,
  onChange,
  onRemove,
}: {
  signal: Extract<Extract<ConditionNode, { kind: "signal" }>["signal"], { family: "TIME_WINDOW" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  const tf = useContext(StrategyTimeframeContext);
  const exit = useContext(ExitTimeContext);
  const candle = Math.max(1, Math.round(intervalDurationSeconds(tf) / 60));
  const atTime = signal.endMinute - signal.startMinute <= candle;
  const setAt = (minute: number) => onChange({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: minute, endMinute: minute + candle } });
  return (
    <div className="space-y-1 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        {atTime ? (
          <>
            <span className="text-xs font-medium text-brand-navy/60">Enter at</span>
            <input type="time" className={inputClass} value={minutesToTimeInput(signal.startMinute)} onChange={(e) => setAt(timeInputToMinutes(e.target.value))} />
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-brand-navy/60">Enter between</span>
            <input
              type="time"
              className={inputClass}
              value={minutesToTimeInput(signal.startMinute)}
              onChange={(e) => onChange({ kind: "signal", signal: { ...signal, startMinute: timeInputToMinutes(e.target.value) } })}
            />
            <span className="text-xs font-medium text-brand-navy/60">and</span>
            <input
              type="time"
              className={inputClass}
              value={minutesToTimeInput(signal.endMinute)}
              onChange={(e) => onChange({ kind: "signal", signal: { ...signal, endMinute: timeInputToMinutes(e.target.value) } })}
            />
            <button type="button" onClick={() => setAt(signal.startMinute)} className="text-[11px] font-semibold text-brand-primary hover:underline">
              Use one time
            </button>
          </>
        )}
        {exit && (
          <>
            <span className="ml-2 text-xs font-medium text-brand-navy/60">Exit at</span>
            {exit.editable ? (
              <>
                <input
                  type="time"
                  className={inputClass}
                  value={exit.exitMinute == null ? "" : minutesToTimeInput(exit.exitMinute)}
                  onChange={(e) => exit.setExitMinute(e.target.value ? timeInputToMinutes(e.target.value) : null)}
                />
                {exit.exitMinute != null && (
                  <button type="button" onClick={() => exit.setExitMinute(null)} className="text-[11px] text-brand-navy/45 hover:text-brand-sell">
                    no exit time
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-brand-navy/50">set by the exit rule below</span>
            )}
          </>
        )}
        <span className="text-xs text-brand-navy/40">(IST)</span>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <TimeWindowStrip startMinute={signal.startMinute} endMinute={signal.endMinute} />
    </div>
  );
}

function SignalEditor({
  node,
  onChange,
  onRemove,
  purpose,
}: {
  node: Extract<ConditionNode, { kind: "signal" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  /** In the simple builder: "Entry time" (a window to enter in) or "Exit time" (exit at a time). */
  purpose?: "entry" | "exit";
}) {
  const signal = node.signal;

  if (signal.family === "TIME_WINDOW" && purpose === "exit") {
    // "Exit at 15:15" = true from that time until the close.
    return (
      <div className="space-y-1 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-brand-navy/60">Exit time: close the position at</span>
        <input
          type="time"
          className={inputClass}
          value={minutesToTimeInput(signal.startMinute)}
          onChange={(e) => onChange({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: timeInputToMinutes(e.target.value), endMinute: 15 * 60 + 30 } })}
        />
        <span className="text-xs text-brand-navy/40">(IST, or the first candle after it)</span>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <TimeWindowStrip startMinute={signal.startMinute} endMinute={signal.endMinute} kind="exit" />
      </div>
    );
  }

  if (signal.family === "TIME_WINDOW" && purpose === "entry") {
    return <EntryTimeEditor signal={signal} onChange={onChange} onRemove={onRemove} />;
  }

  if (signal.family === "TIME_WINDOW") {
    return (
      <div className="space-y-1 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-brand-navy/60">Time is between</span>
        <input
          type="time"
          className={inputClass}
          value={minutesToTimeInput(signal.startMinute)}
          onChange={(e) =>
            onChange({
              kind: "signal",
              signal: { family: "TIME_WINDOW", startMinute: timeInputToMinutes(e.target.value), endMinute: signal.endMinute },
            })
          }
        />
        <span className="text-xs font-medium text-brand-navy/60">and</span>
        <input
          type="time"
          className={inputClass}
          value={minutesToTimeInput(signal.endMinute)}
          onChange={(e) =>
            onChange({
              kind: "signal",
              signal: { family: "TIME_WINDOW", startMinute: signal.startMinute, endMinute: timeInputToMinutes(e.target.value) },
            })
          }
        />
        <span className="text-xs text-brand-navy/40">(IST)</span>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <TimeWindowStrip startMinute={signal.startMinute} endMinute={signal.endMinute} />
      </div>
    );
  }

  if (signal.family === "CANDLE_PATTERN") {
    const grouped: Record<1 | 2 | 3, typeof CANDLE_PATTERN_CATALOG> = { 1: [], 2: [], 3: [] };
    for (const def of CANDLE_PATTERN_CATALOG) grouped[def.candleCount].push(def);
    const groupLabel = { 1: "Single candle", 2: "Double candle", 3: "Triple candle" } as const;

    return (
      <div className="space-y-2 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-brand-navy/60">Candle pattern is</span>
        <select
          className={inputClass}
          value={signal.pattern}
          onChange={(e) => onChange({ kind: "signal", signal: { ...signal, pattern: e.target.value as never } })}
        >
          {([1, 2, 3] as const).map((count) => (
            <optgroup key={count} label={groupLabel[count]}>
              {grouped[count].map((def) => (
                <option key={def.kind} value={def.kind}>
                  {def.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <TimeframeSelect
          value={signal.timeframe}
          onChange={(timeframe) => onChange({ kind: "signal", signal: { ...signal, timeframe } })}
        />
        <select
          className={`${inputClass} text-brand-navy/70`}
          value={signal.atLevel ?? ""}
          title="Where the pattern must form"
          onChange={(e) => {
            const atLevel = (e.target.value || undefined) as "SUPPORT" | "RESISTANCE" | undefined;
            onChange({ kind: "signal", signal: { ...signal, atLevel } });
          }}
        >
          <option value="">Anywhere</option>
          <option value="SUPPORT">At a support level</option>
          <option value="RESISTANCE">At a resistance level</option>
        </select>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
        <input
          type="checkbox"
          className="accent-brand-primary"
          checked={!!signal.window}
          onChange={(e) =>
            onChange({ kind: "signal", signal: { ...signal, window: e.target.checked ? { startMinute: 9 * 60 + 15, endMinute: 11 * 60 } : undefined } })
          }
        />
        Only between
        {signal.window ? (
          <>
            <input
              type="time"
              className={inputClass}
              value={minutesToTimeInput(signal.window.startMinute)}
              onChange={(e) => onChange({ kind: "signal", signal: { ...signal, window: { ...signal.window!, startMinute: timeInputToMinutes(e.target.value) } } })}
            />
            and
            <input
              type="time"
              className={inputClass}
              value={minutesToTimeInput(signal.window.endMinute)}
              onChange={(e) => onChange({ kind: "signal", signal: { ...signal, window: { ...signal.window!, endMinute: timeInputToMinutes(e.target.value) } } })}
            />
            <span className="text-brand-navy/40">(IST, intraday timeframes)</span>
          </>
        ) : (
          <span className="text-brand-navy/40">certain times of day (optional)</span>
        )}
      </label>
      <CandlePatternIllustration pattern={signal.pattern} atLevel={signal.atLevel} />
      </div>
    );
  }

  if (signal.family === "CHART_PATTERN") {
    return (
      <div className="space-y-2 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-brand-navy/60">Chart pattern is</span>
        <select
          className={inputClass}
          value={signal.pattern}
          onChange={(e) =>
            onChange({ kind: "signal", signal: { family: "CHART_PATTERN", pattern: e.target.value as never, timeframe: signal.timeframe } })
          }
        >
          {CHART_PATTERN_CATALOG.map((def) => (
            <option key={def.kind} value={def.kind}>
              {def.label}
            </option>
          ))}
        </select>
        <TimeframeSelect
          value={signal.timeframe}
          onChange={(timeframe) => onChange({ kind: "signal", signal: { ...signal, timeframe } })}
        />
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <ChartPatternIllustration pattern={signal.pattern} />
      </div>
    );
  }

  if (signal.family === "SMC") {
    const set = (patch: Partial<typeof signal>) => onChange({ kind: "signal", signal: { ...signal, ...patch } });
    const retest = signal.pattern === "FVG_RETEST" || signal.pattern === "ORDER_BLOCK_RETEST";
    const gap = signal.pattern === "FVG" || signal.pattern === "FVG_RETEST";
    const usesSwings = !gap;
    const numCls = `${inputClass} w-16`;
    return (
      <div className="space-y-2 rounded-lg bg-brand-bg p-2">
        <div className="flex flex-wrap items-center gap-2">
          <select className={inputClass} aria-label="Bullish or bearish" value={signal.side} onChange={(e) => set({ side: e.target.value as SmcSide })}>
            <option value="BULLISH">Bullish</option>
            <option value="BEARISH">Bearish</option>
          </select>
          <select className={inputClass} aria-label="Smart-money component" value={signal.pattern} onChange={(e) => set({ pattern: e.target.value as SmcKind })}>
            {SMC_KINDS.map((k) => (
              <option key={k} value={k}>
                {SMC_LABEL[k]}
              </option>
            ))}
          </select>
          {usesSwings && (
            <label className="flex items-center gap-1 text-xs text-brand-navy/60" title="Candles each side of a swing high/low; a swing is only known once that many candles after it have closed">
              swings of
              <input type="number" min={1} max={20} className={numCls} value={signal.swing ?? SMC_DEFAULTS.swing} onChange={(e) => set({ swing: Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1))) })} />
              candles
            </label>
          )}
          {retest && (
            <label className="flex items-center gap-1 text-xs text-brand-navy/60">
              within
              <input type="number" min={1} max={500} className={numCls} value={signal.maxAge ?? SMC_DEFAULTS.maxAge} onChange={(e) => set({ maxAge: Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1))) })} />
              candles
            </label>
          )}
          {gap && (
            <label className="flex items-center gap-1 text-xs text-brand-navy/60">
              gap at least
              <input type="number" min={0} max={20} step="0.05" className={numCls} value={signal.minGapPct ?? 0} onChange={(e) => set({ minGapPct: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />%
            </label>
          )}
          <TimeframeSelect value={signal.timeframe} onChange={(timeframe) => set({ timeframe })} />
          <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
            Remove
          </button>
        </div>
        <p className="text-[11px] text-brand-navy/55">{SMC_HELP[signal.pattern]}</p>
      </div>
    );
  }

  if (signal.family === "VOLUME_PATTERN") {
    return (
      <div className="space-y-2 rounded-lg bg-brand-bg p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-brand-navy/60">Volume pattern is</span>
        <select
          className={inputClass}
          value={signal.pattern}
          onChange={(e) =>
            onChange({ kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: e.target.value as never, timeframe: signal.timeframe } })
          }
        >
          {VOLUME_PATTERN_CATALOG.map((def) => (
            <option key={def.kind} value={def.kind}>
              {def.label}
            </option>
          ))}
        </select>
        <TimeframeSelect
          value={signal.timeframe}
          onChange={(timeframe) => onChange({ kind: "signal", signal: { ...signal, timeframe } })}
        />
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
          Remove
        </button>
      </div>
      <VolumePatternIllustration pattern={signal.pattern} />
      </div>
    );
  }

  return null;
}

function OperandEditor({
  value,
  onChange,
  instruments,
  other,
}: {
  value: Operand;
  onChange: (v: Operand) => void;
  instruments: InstrumentOption[];
  /** The operand on the other side of the comparison, if any — used to
   * filter this picker to scale-compatible choices only. Omitted for
   * operands that don't sit in a two-sided comparison (none currently). */
  other?: Operand;
}) {
  const customs = useCustomIndicators();
  const overridesAllowed = useContext(ConditionOverridesContext);
  const indicatorDef = value.kind === "indicator" ? INDICATOR_BY_KIND.get(value.type) : undefined;
  const hasOverrides = value.kind === "indicator" || value.kind === "price" || value.kind === "custom";
  const overridable = hasOverrides ? (value as Extract<Operand, { kind: "indicator" } | { kind: "price" } | { kind: "custom" }>) : null;

  // Filter out choices the other side of the comparison makes nonsensical
  // (e.g. RSI vs a Bollinger Band), but never hide the operand's own
  // *current* selection — that would silently desync the dropdown from a
  // value that's still technically set (e.g. a strategy saved before this
  // rule existed).
  const availableIndicators = INDICATOR_CATALOG.filter((i) => {
    if (value.kind === "indicator" && value.type === i.kind) return true;
    return !other || isIndicatorAllowed(i.kind, other);
  });
  const showPriceGroup = !other || isPriceAllowed(other) || value.kind === "price";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        className={inputClass}
        value={value.kind === "indicator" ? value.type : value.kind === "price" ? `PRICE:${value.field}` : value.kind === "custom" ? `CUSTOM:${value.name}` : "CONST"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "CONST") onChange({ kind: "constant", value: 0 });
          else if (v.startsWith("CUSTOM:")) {
            const c = customs.find((x) => x.name === v.slice(7)) ?? (value.kind === "custom" && value.name === v.slice(7) ? value : null);
            if (c) onChange({ kind: "custom", name: c.name, def: c.def, ...(customParts(c.def).length > 1 ? { part: defaultPart(c.def) } : {}) });
          }
          else if (v.startsWith("PRICE:")) onChange({ kind: "price", field: v.slice(6) as PriceField });
          else {
            const def = INDICATOR_BY_KIND.get(v as never);
            if (def) onChange({ kind: "indicator", type: def.kind, params: [...def.defaults] });
          }
        }}
      >
        {availableIndicators.length > 0 && (
          <optgroup label="Indicator">
            {availableIndicators.map((i) => (
              <option key={i.kind} value={i.kind}>
                {i.label}
              </option>
            ))}
          </optgroup>
        )}
        {showPriceGroup && (
          <optgroup label="Price">
            {PRICE_FIELDS.map((p) => (
              <option key={p.value} value={`PRICE:${p.value}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
        )}
        {(customs.length > 0 || value.kind === "custom") && (
          <optgroup label="Custom">
            {value.kind === "custom" && !customs.some((c) => c.name === value.name) && <option value={`CUSTOM:${value.name}`}>{value.name}</option>}
            {customs.map((c) => (
              <option key={c.name} value={`CUSTOM:${c.name}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value="CONST">Fixed value</option>
      </select>
      {value.kind === "custom" && customParts(value.def).length > 1 && (
        <select aria-label={`Which part of ${value.name}`} className={inputClass} value={value.part ?? defaultPart(value.def)} onChange={(e) => onChange({ ...value, part: e.target.value as CustomPart })}>
          {customParts(value.def).map((p) => (
            <option key={p} value={p}>
              {PART_LABEL[p]}
            </option>
          ))}
        </select>
      )}
      {value.kind === "custom" && (
        <span className="max-w-xs truncate font-mono text-[11px] text-brand-navy/50" title={describeCustom(value.def)}>
          {describeCustom(value.def)}
        </span>
      )}

      {value.kind === "indicator" &&
        indicatorDef?.paramLabels.map((paramLabel, i) => (
          <input
            key={paramLabel + i}
            type="number"
            min={0}
            max={500}
            step="any"
            value={value.params[i]}
            onChange={(e) => {
              const params = value.params.slice();
              params[i] = Number(e.target.value);
              onChange({ ...value, params });
            }}
            className={`${inputClass} w-16`}
            aria-label={paramLabel}
            title={paramLabel}
          />
        ))}

      {value.kind === "constant" && (
        <input
          type="number"
          value={value.value}
          onChange={(e) => onChange({ kind: "constant", value: Number(e.target.value) })}
          className={`${inputClass} w-20`}
          aria-label="Value"
        />
      )}

      {overridable && !overridesAllowed && (
        <>
          <TimeframeSelect value={overridable.timeframe} onChange={(timeframe) => onChange({ ...overridable, timeframe })} />
          {overridable.instrumentSymbol && (
            <OverrideChip label={`on ${overridable.instrumentSymbol.replace(/\.NS$/, "")}`} onClear={() => onChange({ ...overridable, instrumentSymbol: undefined })} />
          )}
        </>
      )}
      {overridable && overridesAllowed && (
        <>
          <TimeframeSelect value={overridable.timeframe} onChange={(timeframe) => onChange({ ...overridable, timeframe })} />
          <InstrumentCombobox
            compact
            className="w-40"
            options={instruments}
            valueKey="symbol"
            emptyLabel="Same instrument"
            value={overridable.instrumentSymbol ?? ""}
            onChange={(symbol) => onChange({ ...overridable, instrumentSymbol: symbol || undefined })}
          />
        </>
      )}
    </div>
  );
}

function ComparisonEditor({
  node,
  onChange,
  onRemove,
  instruments,
}: {
  node: Extract<ConditionNode, { kind: "comparison" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  instruments: InstrumentOption[];
}) {
  // Changing one side can strand the other side on a now-incompatible
  // selection (e.g. right was EMA, left just became RSI; or right was MACD
  // Signal, left just became RSI — a different oscillator family). Rather
  // than leave that stale mismatch sitting there until the user notices,
  // snap the other side back to a fixed value the moment it becomes
  // invalid, which is always a safe fallback since a constant is
  // compatible with everything.
  function handleLeftChange(left: Operand) {
    const right = operandsScaleCompatible(left, node.right) ? node.right : { kind: "constant" as const, value: 0 };
    onChange({ ...node, left, right });
  }

  function handleRightChange(right: Operand) {
    const left = operandsScaleCompatible(node.left, right) ? node.left : { kind: "constant" as const, value: 0 };
    onChange({ ...node, left, right });
  }

  const indicators = [node.left, node.right].filter((o): o is Extract<Operand, { kind: "indicator" }> => o.kind === "indicator");
  const unique = indicators.filter((o, i) => indicators.findIndex((x) => x.type === o.type) === i);

  return (
    <div className="rounded-lg bg-brand-bg p-2">
    <div className="flex flex-wrap items-center gap-2">
      <OperandEditor value={node.left} onChange={handleLeftChange} instruments={instruments} other={node.right} />
      <select
        className={inputClass}
        value={node.operator}
        onChange={(e) => onChange({ ...node, operator: e.target.value as ComparisonOperator })}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <OperandEditor value={node.right} onChange={handleRightChange} instruments={instruments} other={node.left} />
      <button type="button" onClick={onRemove} className="ml-auto text-xs text-brand-navy/40 hover:text-brand-sell">
        Remove
      </button>
    </div>
    {unique.length > 0 && <IndicatorPictures operands={unique} />}
    </div>
  );
}

/** "What does RSI look like?" — pictures of the indicators in a comparison, on demand. */
function IndicatorPictures({ operands }: { operands: Extract<Operand, { kind: "indicator" }>[] }) {
  const [open, setOpen] = useState(false);
  const names = operands.map((o) => INDICATOR_BY_KIND.get(o.type)?.label ?? o.type).join(" and ");
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-brand-primary hover:underline">
        {open ? `Hide the picture${operands.length > 1 ? "s" : ""}` : `What does ${names} look like?`}
      </button>
      {open && (
        <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
          {operands.map((o) => (
            <IndicatorIllustration key={o.type} kind={o.type} params={o.params} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConditionGroupEditor({
  node,
  onChange,
  depth = 0,
  instruments = [],
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  depth?: number;
  instruments?: InstrumentOption[];
}) {
  if (node.kind === "comparison") {
    return (
      <ComparisonEditor node={node} onChange={onChange} onRemove={() => onChange(defaultComparison())} instruments={instruments} />
    );
  }

  if (node.kind === "signal") {
    return <SignalEditor node={node} onChange={onChange} onRemove={() => onChange(defaultComparison())} />;
  }

  if (node.kind === "not") {
    return (
      <div className="rounded-lg border border-dashed border-brand-navy/20 p-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">NOT</p>
        <ConditionGroupEditor node={node.child} onChange={(child) => onChange({ kind: "not", child })} depth={depth + 1} />
      </div>
    );
  }

  if (node.kind === "recent") {
    const r = node;
    return (
      <div className="rounded-lg border border-dashed border-brand-navy/20 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-brand-navy/60">
          <select value={r.mode} onChange={(e) => onChange({ ...r, mode: e.target.value as "ANY" | "ALL" })} className="rounded border border-brand-navy/15 px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-navy/70" aria-label="Look-back mode">
            <option value="ANY">True at least once in</option>
            <option value="ALL">True on every candle of</option>
          </select>
          <span>the</span>
          <input type="number" min={1} max={500} step={1} value={r.bars} aria-label="Look-back candles" onChange={(e) => onChange({ ...r, bars: Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)) })} className="w-16 rounded border border-brand-navy/15 px-1.5 py-1 text-xs" />
          <span>{r.excludeCurrent ? "candles before this one" : "latest candles (including this one)"}</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-brand-primary" checked={!!r.excludeCurrent} onChange={(e) => onChange({ ...r, excludeCurrent: e.target.checked })} />
            not this one
          </label>
        </div>
        <ConditionGroupEditor node={r.child} onChange={(child) => onChange({ ...r, child })} depth={depth + 1} />
      </div>
    );
  }

  const group = node;

  function updateChild(idx: number, child: ConditionNode) {
    const children = group.children.slice();
    children[idx] = child;
    onChange({ ...group, children });
  }

  function removeChild(idx: number) {
    const children = group.children.filter((_, i) => i !== idx);
    onChange({ ...group, children: children.length > 0 ? children : [defaultComparison()] });
  }

  function addCondition() {
    onChange({ ...group, children: [...group.children, defaultComparison()] });
  }

  function addTimeWindow() {
    onChange({ ...group, children: [...group.children, defaultTimeWindow()] });
  }

  function addCandlePattern() {
    onChange({ ...group, children: [...group.children, defaultCandlePattern()] });
  }

  function addChartPattern() {
    onChange({ ...group, children: [...group.children, defaultChartPattern()] });
  }

  function addVolumePattern() {
    onChange({ ...group, children: [...group.children, defaultVolumePattern()] });
  }

  function addSmc() {
    onChange({ ...group, children: [...group.children, defaultSmc()] });
  }

  function addGroup() {
    onChange({
      ...group,
      children: [...group.children, { kind: "group", op: "AND", children: [defaultComparison()] }],
    });
  }

  return (
    <div className={depth > 0 ? "rounded-lg border border-dashed border-brand-navy/20 p-2" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Match</span>
        <div className="flex overflow-hidden rounded-full border border-brand-navy/15">
          {(["AND", "OR"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...group, op })}
              className={`px-3 py-1 text-xs font-medium ${
                group.op === op ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"
              }`}
            >
              {op === "AND" ? "all" : "any"}
            </button>
          ))}
        </div>
        <span className="text-xs text-brand-navy/40">of the following</span>
      </div>

      <div className="space-y-2">
        {group.children.map((child, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              {child.kind === "comparison" ? (
                <ComparisonEditor
                  node={child}
                  onChange={(n) => updateChild(idx, n)}
                  onRemove={() => removeChild(idx)}
                  instruments={instruments}
                />
              ) : child.kind === "signal" ? (
                <SignalEditor node={child} onChange={(n) => updateChild(idx, n)} onRemove={() => removeChild(idx)} />
              ) : (
                <div className="rounded-lg border border-dashed border-brand-navy/20 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Group</span>
                    <button type="button" onClick={() => removeChild(idx)} className="text-xs text-brand-navy/40 hover:text-brand-sell">
                      Remove group
                    </button>
                  </div>
                  <ConditionGroupEditor node={child} onChange={(n) => updateChild(idx, n)} depth={depth + 1} instruments={instruments} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={addCondition} className={pillButtonClass}>
          + Condition
        </button>
        <button type="button" onClick={addTimeWindow} className={pillButtonClass}>
          + Time window
        </button>
        <button type="button" onClick={addCandlePattern} className={pillButtonClass}>
          + Candle pattern
        </button>
        <button type="button" onClick={addChartPattern} className={pillButtonClass}>
          + Chart pattern
        </button>
        <button type="button" onClick={addVolumePattern} className={pillButtonClass}>
          + Volume pattern
        </button>
        <button type="button" onClick={addSmc} className={pillButtonClass} title="Break of structure, change of character, liquidity sweep, fair value gap, order block">
          + Smart money
        </button>
        {depth < 2 && (
          <button type="button" onClick={addGroup} className={pillButtonClass}>
            + Group
          </button>
        )}
      </div>
    </div>
  );
}

export {
  defaultComparison,
  defaultOperand,
  defaultTimeWindow,
  defaultCandlePattern,
  defaultChartPattern,
  defaultVolumePattern,
  SignalEditor,
  ComparisonEditor,
};
