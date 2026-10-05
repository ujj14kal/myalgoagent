"use client";
import InstrumentCombobox from "@/components/instrument-combobox";
import { friendlyError } from "@/lib/friendly-error";
import WebhookGuide from "@/components/webhook-guide";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConditionGroupEditor, { ConditionOverridesContext, ExitTimeContext, StrategyTimeframeContext, defaultComparison } from "@/components/condition-group-editor";
import type { CandleInterval } from "@/lib/market-data";
import SimpleConditionPicker, { ALL_CATEGORIES, fitsSimpleMode, unwrapForSimpleMode } from "@/components/simple-condition-picker";
import StrategyCodeEditor from "@/components/strategy-code-editor";
import PositionSizingFields from "@/components/position-sizing-fields";
import RiskManagementFields, { type RiskLegState } from "@/components/risk-management-fields";
import DraftAutoSaveToast from "@/components/draft-autosave-toast";
import CandlePatternIllustration from "@/components/candle-pattern-illustration";
import StrategyPreview from "@/components/strategy-preview";
import { CANDLE_PATTERN_BY_KIND } from "@/lib/strategy/candle-pattern-catalog";
import type { CandlePatternKind } from "@/lib/candle-patterns";
import type { ChartPatternKind } from "@/lib/chart-patterns";
import ChartPatternIllustration from "@/components/chart-pattern-illustration";
import VolumePatternIllustration from "@/components/volume-pattern-illustration";
import IndicatorIllustration from "@/components/indicator-illustration";
import type { VolumePatternKind } from "@/lib/volume-patterns";
import type { IndicatorKind } from "@/lib/strategy/types";
import { VOLUME_PATTERN_BY_KIND } from "@/lib/strategy/volume-pattern-catalog";
import { INDICATOR_BY_KIND } from "@/lib/strategy/indicator-catalog";
import { CHART_PATTERN_BY_KIND } from "@/lib/strategy/chart-pattern-catalog";
import { DEFAULT_SQUARE_OFF_MINUTE, STRATEGY_TIMEFRAMES, defaultProduct } from "@/lib/strategy/session";
import { createStrategy, updateStrategy, autoSaveDraftStrategy, type StrategyInput } from "@/lib/strategy-actions";
import { NEVER_EXIT_CONDITION, isNeverExitCondition, type FeasibilitySection } from "@/lib/strategy/types";
import { consumeDraftReminderSkip, setDraftReminderSkipCount } from "@/lib/draft-reminder";
import type { ConditionNode } from "@/lib/strategy";
import type { EntryPlan, PositionSizingMode, RiskUnit, TargetLevel } from "@/lib/trading-engine/step";
import StagedTargetsFields, { rowsToTargets, targetsToRows, type TargetRow } from "@/components/staged-targets-fields";
import EntryPlanFields, { planToState, stateToPlan, type PlanState } from "@/components/entry-plan-fields";
import type { StrategyStyle } from "@/lib/strategy/style";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

/** A feasibility issue as shown in the popup — `section` is present when it
 * came from the structured feasibility checks (and so can be linked to a
 * spot on the form); absent for a generic/unexpected error string, which is
 * shown with no "Fix it" link. */
interface DisplayIssue {
  section?: FeasibilitySection;
  message: string;
}

/** The server returns feasibility failures as a JSON-encoded FeasibilityIssue[]
 * (see throwIfInfeasible in strategy-actions.ts) so the popup can link each
 * one back to the form section that needs fixing. Anything that isn't valid
 * JSON in that shape is an unrelated error string (auth failure, a thrown
 * exception's plain message, etc.) and is shown as a single sectionless issue. */
function parseIssues(raw: string): DisplayIssue[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => p && typeof p === "object" && "message" in p)) {
      return parsed as DisplayIssue[];
    }
  } catch {
    // Not JSON — fall through to the plain-string case below.
  }
  return [{ message: raw }];
}

function toRiskLegState(enabled: boolean, unit: RiskUnit | null, value: number | null, fallback: number): RiskLegState {
  return { enabled, unit: unit ?? "PERCENT", value: value ?? fallback };
}

type UsedPattern =
  | { family: "CANDLE_PATTERN"; pattern: CandlePatternKind; atLevel?: "SUPPORT" | "RESISTANCE" }
  | { family: "CHART_PATTERN"; pattern: ChartPatternKind }
  | { family: "VOLUME_PATTERN"; pattern: VolumePatternKind }
  | { family: "INDICATOR"; pattern: IndicatorKind; params: number[] };

/** Every distinct pattern and indicator used anywhere in a condition tree. */
function collectPatterns(node: ConditionNode, out: UsedPattern[] = []) {
  if (node.kind === "group") node.children.forEach((c) => collectPatterns(c, out));
  else if (node.kind === "not" || node.kind === "recent") collectPatterns(node.child, out);
  else if (node.kind === "comparison") {
    for (const o of [node.left, node.right]) {
      if (o.kind === "indicator" && !out.some((p) => p.family === "INDICATOR" && p.pattern === o.type)) {
        out.push({ family: "INDICATOR", pattern: o.type, params: o.params });
      }
    }
  } else if (node.kind === "signal") {
    const sig = node.signal;
    if (sig.family === "CANDLE_PATTERN" && !out.some((p) => p.family === "CANDLE_PATTERN" && p.pattern === sig.pattern && p.atLevel === sig.atLevel)) {
      out.push({ family: "CANDLE_PATTERN", pattern: sig.pattern, atLevel: sig.atLevel });
    }
    if (sig.family === "CHART_PATTERN" && !out.some((p) => p.family === "CHART_PATTERN" && p.pattern === sig.pattern)) {
      out.push({ family: "CHART_PATTERN", pattern: sig.pattern });
    }
    if (sig.family === "VOLUME_PATTERN" && !out.some((p) => p.family === "VOLUME_PATTERN" && p.pattern === sig.pattern)) {
      out.push({ family: "VOLUME_PATTERN", pattern: sig.pattern });
    }
  }
  return out;
}

/** One numbered step of the builder — the form reads top to bottom. */
function BuilderSection({
  step,
  title,
  subtitle,
  action,
  sectionRef,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <section ref={sectionRef} className="surface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">{step}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-navy">{title}</p>
          {subtitle && <p className="text-xs text-brand-navy/50">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const NEW_STRATEGY_DRAFT_KEY = "maa:new-strategy-draft";

/** Whether a rule uses the time of day (a time window, or a candle pattern limited to certain times). */
function hasTimeRule(node: ConditionNode): boolean {
  if (node.kind === "group") return node.children.some(hasTimeRule);
  if (node.kind === "not" || node.kind === "recent") return hasTimeRule(node.child);
  if (node.kind !== "signal") return false;
  return node.signal.family === "TIME_WINDOW" || (node.signal.family === "CANDLE_PATTERN" && !!node.signal.window);
}

export interface StrategyInitial {
  name: string;
  instrumentId: string;
  mode: "NO_CODE" | "CODE" | "WEBHOOK";
  direction: "LONG" | "SHORT";
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  entrySource: string | null;
  exitSource: string | null;
  positionSizingMode: PositionSizingMode;
  positionSizingValue: number | null;
  stopLossEnabled: boolean;
  stopLossUnit: RiskUnit | null;
  stopLossValue: number | null;
  targetEnabled: boolean;
  targetUnit: RiskUnit | null;
  targetValue: number | null;
  trailingSlEnabled: boolean;
  trailingSlUnit: RiskUnit | null;
  trailingSlValue: number | null;
  maxPyramidEntries: number;
  timeframe?: string;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
  productType?: string;
  orderType?: string;
  limitMode?: string | null;
  limitValue?: number | null;
  /** Swing / positional strategies are held for days to months. */
  style?: string | null;
  /** Staged Target 1–3 and the multi-level entry plan, when the strategy uses them. */
  targets?: TargetLevel[];
  entryPlan?: EntryPlan | null;
}

/** A row of pill buttons for one choice. */
function PillChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; note?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{label}</label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            title={o.note}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              value === o.value ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
            }`}
          >
            {o.label}
            {o.note && <span className="ml-1 font-normal opacity-70">· {o.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMinutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

/** An optional time-of-day setting: a checkbox that switches it on, and the time. */
function SessionTimeField({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  fallback: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="rounded-xl border border-brand-navy/10 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-brand-navy">
        <input type="checkbox" className="accent-brand-primary" checked={value !== null} onChange={(e) => onChange(e.target.checked ? fallback : null)} />
        {label}
      </label>
      <p className="mt-0.5 text-xs text-brand-navy/40">{hint}</p>
      {value !== null && (
        <input
          type="time"
          min="09:15"
          max="15:30"
          value={minutesToTime(value)}
          onChange={(e) => e.target.value && onChange(timeToMinutes(e.target.value))}
          className="mt-2 rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm outline-none focus:border-brand-primary"
        />
      )}
    </div>
  );
}

export default function StrategyBuilderForm({
  instruments,
  strategyId,
  initial,
}: {
  instruments: InstrumentOption[];
  strategyId?: string;
  initial?: StrategyInitial;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [instrumentId, setInstrumentId] = useState(initial?.instrumentId ?? (instruments.find((i) => i.symbol === "RELIANCE.NS") ?? instruments.find((i) => !i.symbol.startsWith("^")) ?? instruments[0])?.id ?? "");
  const [mode, setMode] = useState<"NO_CODE" | "CODE" | "WEBHOOK">(initial?.mode ?? "NO_CODE");
  const [direction, setDirection] = useState<"LONG" | "SHORT">(initial?.direction ?? "LONG");

  const initialEntryFitsSimple = initial ? fitsSimpleMode(initial.entryCondition) : true;
  // One layout for rules; a rule saved in the old free-form layout still opens in the full editor.
  const entryMode: "SIMPLE" | "ADVANCED" = initialEntryFitsSimple ? "SIMPLE" : "ADVANCED";
  const [entryCondition, setEntryCondition] = useState<ConditionNode>(
    initial ? (initialEntryFitsSimple ? unwrapForSimpleMode(initial.entryCondition) : initial.entryCondition) : defaultComparison(),
  );

  const initialExitOpen = initial ? !isNeverExitCondition(initial.exitCondition) : false;
  const initialExitFitsSimple = initial ? fitsSimpleMode(initial.exitCondition) : true;
  const [exitConditionOpen, setExitConditionOpen] = useState(initialExitOpen);
  const exitMode: "SIMPLE" | "ADVANCED" = initialExitFitsSimple ? "SIMPLE" : "ADVANCED";
  const [exitCondition, setExitCondition] = useState<ConditionNode>(
    initial && initialExitOpen
      ? initialExitFitsSimple
        ? unwrapForSimpleMode(initial.exitCondition)
        : initial.exitCondition
      : defaultComparison(),
  );

  const [entrySource, setEntrySource] = useState(initial?.entrySource ?? "sma(20) crossesAbove ema(50)");
  const [exitSource, setExitSource] = useState(initial?.exitSource ?? "sma(20) crossesBelow ema(50)");

  const [positionSizingMode, setPositionSizingMode] = useState<PositionSizingMode>(initial?.positionSizingMode ?? "FULL_CAPITAL");
  const [positionSizingValue, setPositionSizingValue] = useState<number | null>(initial?.positionSizingValue ?? null);
  const [maxPyramidEntries, setMaxPyramidEntries] = useState(initial?.maxPyramidEntries ?? 1);
  // Swing and positional strategies are held overnight: daily candles, delivery, long only.
  const [style, setStyle] = useState<"STANDARD" | "SWING" | "POSITIONAL">(initial?.style === "SWING" || initial?.style === "POSITIONAL" ? initial.style : "STANDARD");
  const swingish = style !== "STANDARD";
  const [plan, setPlan] = useState<PlanState>(() => planToState(initial?.entryPlan));
  const [targetRows, setTargetRows] = useState<TargetRow[]>(() => targetsToRows(initial?.targets));
  const [timeframe, setTimeframe] = useState<string>(initial?.timeframe ?? "1d");
  const [noEntryAfterMinute, setNoEntryAfterMinute] = useState<number | null>(initial?.noEntryAfterMinute ?? null);
  // Intraday strategies square off at 15:15 by default — many brokers only allow intraday until then.
  const [squareOffMinute, setSquareOffMinute] = useState<number | null>(
    initial ? (initial.squareOffMinute ?? null) : DEFAULT_SQUARE_OFF_MINUTE,
  );
  const intraday = timeframe !== "1d";
  const [productType, setProductType] = useState<"INTRADAY" | "DELIVERY">(
    initial?.productType === "INTRADAY" || initial?.productType === "DELIVERY" ? initial.productType : defaultProduct(initial?.timeframe ?? "1d"),
  );
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">(initial?.orderType === "LIMIT" ? "LIMIT" : "MARKET");
  const [limitMode, setLimitMode] = useState<"PERCENT" | "PRICE">(initial?.limitMode === "PRICE" ? "PRICE" : "PERCENT");
  const [limitValue, setLimitValue] = useState<number | null>(initial?.limitValue ?? 0.2);

  // A time-of-day rule ("Enter at 09:20", "Exit at 15:00") can't work on daily candles,
  // so choosing one moves the strategy to 5-minute candles and says so.
  const [switchedForTime, setSwitchedForTime] = useState(false);
  useEffect(() => {
    if (mode !== "NO_CODE" || timeframe !== "1d") return;
    if (hasTimeRule(entryCondition) || (exitConditionOpen && hasTimeRule(exitCondition))) {
      chooseTimeframe("5m");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the user's rule choice
      setSwitchedForTime(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the rules or timeframe change
  }, [entryCondition, exitCondition, exitConditionOpen, timeframe, mode]);

  /** Daily candles can only be Delivery; moving to an intraday timeframe suggests Intraday. */
  function chooseTimeframe(tf: string) {
    if (tf === "1d") setProductType("DELIVERY");
    else if (timeframe === "1d") setProductType("INTRADAY");
    setTimeframe(tf);
  }
  const [stopLoss, setStopLoss] = useState<RiskLegState>(
    toRiskLegState(initial?.stopLossEnabled ?? false, initial?.stopLossUnit ?? null, initial?.stopLossValue ?? null, 2),
  );
  const [target, setTarget] = useState<RiskLegState>(
    toRiskLegState(initial?.targetEnabled ?? false, initial?.targetUnit ?? null, initial?.targetValue ?? null, 4),
  );
  const [trailingSl, setTrailingSl] = useState<RiskLegState>(
    toRiskLegState(initial?.trailingSlEnabled ?? false, initial?.trailingSlUnit ?? null, initial?.trailingSlValue ?? null, 1.5),
  );

  /** Choosing swing or positional moves the strategy to what such a strategy can be: daily candles, delivery, long only. */
  function chooseStyle(next: "STANDARD" | "SWING" | "POSITIONAL") {
    setStyle(next);
    if (next === "STANDARD") return;
    setTimeframe("1d");
    setProductType("DELIVERY");
    setDirection("LONG");
    setNoEntryAfterMinute(null);
    setSquareOffMinute(null);
  }

  const [feasibilityIssues, setFeasibilityIssues] = useState<DisplayIssue[] | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only the "New Strategy" flow gets the leave-and-auto-save guard —
  // editing an existing strategy already has its own row to save into,
  // navigating away from an edit just discards the in-progress edits like
  // any ordinary form, matching how it always worked.
  const router = useRouter();
  const isCreating = !strategyId;
  const isDirty = isCreating && name.trim().length > 0;
  // Effects below run once (mount-only) and read state through refs
  // rather than closing over it directly, so they see the *current* value
  // on every click/unload without having to resubscribe their listeners
  // on every keystroke.
  const isDirtyRef = useRef(isDirty);
  // Assigned fresh every render (via the plain useEffect below, and right
  // after buildInput is declared further down) so the click handler's
  // effect — which only re-subscribes when isCreating/router change, not
  // on every keystroke — always reads the *current* form state through
  // these refs rather than whatever it closed over at mount.
  const buildInputRef = useRef<() => StrategyInput>(null!);
  const navigatingRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  });
  const [showDraftToast, setShowDraftToast] = useState(false);
  const [dontRemindChecked, setDontRemindChecked] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Native, un-customizable safety net for an actual tab close/refresh —
  // browsers only allow a generic "leave site?" prompt here, never custom
  // text or UI, so this is deliberately just a backstop; the real,
  // designed experience is the in-app navigation intercept below.
  useEffect(() => {
    if (!isCreating) return;
    function handler(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isCreating]);

  // Intercepts clicking any in-app link (sidebar nav, topbar, breadcrumbs)
  // while the form has unsaved input — auto-saves as a draft, then lets
  // the click's original navigation continue. A capture-phase document
  // listener is the only reliable way to catch this across every link on
  // the page without threading a handler through the whole app shell.
  useEffect(() => {
    if (!isCreating) return;
    function handleClick(e: MouseEvent) {
      if (!isDirtyRef.current || navigatingRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      e.preventDefault();
      navigatingRef.current = true;
      void (async () => {
        const result = await autoSaveDraftStrategy(buildInputRef.current());
        if ("error" in result || consumeDraftReminderSkip() === false) {
          router.push(href);
          return;
        }
        setPendingHref(href);
        setShowDraftToast(true);
        // Purely a display window, not a decision deadline — nothing the
        // user does or doesn't do here changes that the draft is already
        // saved; navigation just proceeds on its own once it's had a
        // moment to register.
        window.setTimeout(() => router.push(href), 4500);
      })();
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isCreating, router]);

  function handleDontRemindChange(checked: boolean) {
    setDontRemindChecked(checked);
    setDraftReminderSkipCount(checked ? 5 : 0);
  }

  function dismissDraftToast() {
    setShowDraftToast(false);
    if (pendingHref) router.push(pendingHref);
  }

  const entryRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLDivElement>(null);
  // The Risk management section (same place in every mode).
  const riskRef = useRef<HTMLDivElement>(null);
  const positionSizingRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<FeasibilitySection, React.RefObject<HTMLDivElement | null>> = {
    entry: entryRef,
    exit: exitRef,
    risk: riskRef,
    positionSizing: positionSizingRef,
  };

  function goToSection(section?: FeasibilitySection) {
    setFeasibilityIssues(null);
    if (!section) return;
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function buildInput(): StrategyInput {
    const finalExitCondition = exitConditionOpen ? exitCondition : NEVER_EXIT_CONDITION;
    return {
      name,
      instrumentId,
      mode,
      direction,
      ...(mode === "WEBHOOK"
        ? {}
        : mode === "CODE"
          ? { entrySource, exitSource }
          : { entryCondition, exitCondition: finalExitCondition }),
      positionSizingMode,
      positionSizingValue,
      stopLoss,
      target,
      trailingSl,
      maxPyramidEntries,
      ...(mode !== "WEBHOOK" && swingish ? { style: style as StrategyStyle } : {}),
      ...(mode !== "WEBHOOK" && stateToPlan(plan).plan ? { entryPlan: stateToPlan(plan).plan } : {}),
      ...(mode !== "WEBHOOK" && targetRows.length ? { targets: rowsToTargets(targetRows) } : {}),
      timeframe,
      noEntryAfterMinute: intraday ? noEntryAfterMinute : null,
      squareOffMinute: intraday && productType === "INTRADAY" ? squareOffMinute : null,
      productType,
      orderType,
      limitMode: orderType === "LIMIT" ? limitMode : null,
      limitValue: orderType === "LIMIT" ? limitValue : null,
    };
  }
  useEffect(() => {
    buildInputRef.current = buildInput;
    // A new strategy in progress is kept in this tab, so a reload (e.g. after an update) doesn't lose it.
    if (!strategyId) {
      try {
        sessionStorage.setItem(NEW_STRATEGY_DRAFT_KEY, JSON.stringify(buildInput()));
      } catch {
        // storage unavailable (private mode etc.) — nothing to keep
      }
    }
  });

  function submit(input: StrategyInput) {
    startTransition(async () => {
      try {
        // Validation failures come back as a plain `{ error }` return value,
        // not a thrown error — Next.js redacts custom error messages thrown
        // across a Server Action boundary in production builds (the client
        // only ever sees a generic, unhelpful placeholder), so any message
        // we actually want the user to see has to travel as data, not as an
        // exception. Only `redirect()`'s own internal throw (on success) is
        // exempt from that redaction, which is why it's still handled below.
        const result = strategyId ? await updateStrategy(strategyId, input) : await createStrategy(input);
        if (result?.id) {
          // Saved: nothing is left unsaved, so leaving must not ask "Leave site?".
          isDirtyRef.current = false;
          navigatingRef.current = true;
          try {
            sessionStorage.removeItem(NEW_STRATEGY_DRAFT_KEY);
          } catch {}
          router.push(`/app/strategies/${result.id}`);
          return;
        }
        if (result?.error === "DUPLICATE_NAME") {
          setFeasibilityIssues([{ message: `You already have a strategy named "${input.name.trim()}". Choose a different name.` }]);
          return;
        }
        if (result?.error) {
          setFeasibilityIssues(parseIssues(result.error));
        }
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          // Saved — the kept draft is no longer needed.
          try {
            sessionStorage.removeItem(NEW_STRATEGY_DRAFT_KEY);
          } catch {}
          throw err;
        }
        setFeasibilityIssues([{ message: friendlyError(err, "Couldn't save the strategy — please try again.") }]);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeasibilityIssues(null);
    const planCheck = stateToPlan(plan);
    if (planCheck.error) {
      setFeasibilityIssues([{ message: planCheck.error, section: "positionSizing" }]);
      return;
    }
    submit(buildInput());
  }

  // "Exit at" in the entry section's time rule sets (or clears) a time-based exit rule.
  const exitTimeMinute =
    exitConditionOpen && exitCondition.kind === "signal" && exitCondition.signal.family === "TIME_WINDOW" ? exitCondition.signal.startMinute : null;
  const exitTime = {
    exitMinute: exitTimeMinute,
    // Only when the exit rule is empty or already a time rule — never overwrite another exit rule.
    editable: !exitConditionOpen || exitTimeMinute !== null,
    setExitMinute: (m: number | null) => {
      if (m === null) {
        setExitConditionOpen(false);
        setExitCondition(defaultComparison());
        return;
      }
      setExitCondition({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: m, endMinute: 15 * 60 + 30 } });
      setExitConditionOpen(true);
    },
  };

  const usedPatterns = mode === "NO_CODE" ? collectPatterns(exitConditionOpen ? exitCondition : NEVER_EXIT_CONDITION, collectPatterns(entryCondition)) : [];

  return (
    <>
      <StrategyTimeframeContext.Provider value={timeframe as CandleInterval}>
      <ConditionOverridesContext.Provider value={false}>
      <ExitTimeContext.Provider value={exitTime}>
      <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-5">
        <div className="surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                Strategy name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
                placeholder="e.g. SMA/EMA crossover"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                Instrument
              </label>
              <InstrumentCombobox options={instruments} value={instrumentId} onChange={setInstrumentId} />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              Build with
            </label>
            <div className="flex w-fit overflow-hidden rounded-full border border-brand-navy/15">
              {(["NO_CODE", "CODE", "WEBHOOK"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium ${
                    mode === m ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"
                  }`}
                >
                  {m === "NO_CODE" ? "Build visually" : m === "CODE" ? "Write code" : "Webhook"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <BuilderSection step={1} title="Position" subtitle="Which way to trade and how much" sectionRef={positionSizingRef}>
          <div className="space-y-5">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                Direction
              </label>
              <div className="flex w-fit overflow-hidden rounded-full border border-brand-navy/15">
                {(["LONG", "SHORT"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    disabled={swingish && d === "SHORT"}
                    title={swingish && d === "SHORT" ? "Swing and positional strategies are long only: a short can't be held overnight in the cash market." : undefined}
                    className={`px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      direction === d
                        ? d === "LONG"
                          ? "bg-brand-buy text-white"
                          : "bg-brand-sell text-white"
                        : "text-brand-navy/60 hover:bg-brand-bg"
                    }`}
                  >
                    {d === "LONG" ? "Buy (Long)" : "Sell (Short)"}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-brand-navy/40">
                {direction === "LONG"
                  ? "Entry buys to open; exit sells to close."
                  : "Entry sells to open (short); exit buys to cover."}
              </p>
            </div>
            {mode !== "WEBHOOK" && (
              <div>
                <PillChoice
                  label="Holding style"
                  value={style}
                  onChange={chooseStyle}
                  options={[
                    { value: "STANDARD", label: "Standard" },
                    { value: "SWING", label: "Swing", note: "days to weeks" },
                    { value: "POSITIONAL", label: "Positional", note: "weeks to months" },
                  ]}
                />
                <p className="mt-1.5 text-xs text-brand-navy/40">
                  {swingish
                    ? "Held overnight: daily candles, delivery, long only. Your rules can still read a weekly or monthly trend as another timeframe. Pair it with an entry plan and staged targets below."
                    : "Choose Swing or Positional for strategies that build and leave a position over days or months."}
                </p>
              </div>
            )}
            {mode !== "WEBHOOK" && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                  Timeframe
                </label>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Timeframe">
                  {STRATEGY_TIMEFRAMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={timeframe === t.value}
                      onClick={() => chooseTimeframe(t.value)}
                      disabled={swingish && t.value !== "1d"}
                      title={swingish && t.value !== "1d" ? "Swing and positional strategies run on daily candles." : undefined}
                      className={`min-w-[44px] rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        timeframe === t.value ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-brand-navy/40">
                  {intraday
                    ? `Checks the rules on every ${STRATEGY_TIMEFRAMES.find((t) => t.value === timeframe)?.label} candle. Intraday history is limited: about ${
                        timeframe === "1m" || timeframe === "3m" ? "7 days" : timeframe === "60m" || timeframe === "4h" ? "1 year" : "60 days"
                      } for backtests on the current data source.`
                    : "Checks the rules once per day, on each daily candle."}
                </p>
              </div>
            )}
            {mode !== "WEBHOOK" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <PillChoice
                    label="Product"
                    value={productType}
                    onChange={(v) => setProductType(v as "INTRADAY" | "DELIVERY")}
                    options={[
                      { value: "INTRADAY", label: "Intraday", disabled: !intraday || swingish, note: swingish ? "not for swing" : !intraday ? "needs 1m–4H" : undefined },
                      { value: "DELIVERY", label: "Delivery" },
                      { value: "MTF" as "DELIVERY", label: "MTF", disabled: true, note: "coming soon" },
                    ]}
                  />
                  <p className="mt-1.5 text-xs text-brand-navy/40">
                    {productType === "INTRADAY"
                      ? "Squared off the same day — never held overnight."
                      : "Can be held overnight. Long only: short positions can't be carried overnight in the cash market."}
                  </p>
                  {productType === "DELIVERY" && direction === "SHORT" && (
                    <p className="mt-1.5 text-xs font-medium text-brand-sell">Delivery can&apos;t be short — choose Intraday or Buy (Long).</p>
                  )}
                </div>
                <div>
                  <PillChoice
                    label="Entry order"
                    value={orderType}
                    onChange={(v) => setOrderType(v)}
                    options={[
                      { value: "MARKET", label: "At market" },
                      { value: "LIMIT", label: "Limit" },
                    ]}
                  />
                  {orderType === "MARKET" ? (
                    <p className="mt-1.5 text-xs text-brand-navy/40">Fills at the next candle&apos;s open after the entry rule fires.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="flex w-fit overflow-hidden rounded-full border border-brand-navy/15">
                        {(["PERCENT", "PRICE"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setLimitMode(m);
                              setLimitValue(m === "PERCENT" ? 0.2 : null);
                            }}
                            className={`px-3 py-1 text-xs font-medium ${limitMode === m ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"}`}
                          >
                            {m === "PERCENT" ? "% from signal price" : "Fixed price (₹)"}
                          </button>
                        ))}
                      </div>
                      <div className="flex max-w-xs items-center gap-2">
                        {limitMode === "PRICE" && <span className="text-sm text-brand-navy/50">₹</span>}
                        <input
                          type="number"
                          min={0}
                          step={limitMode === "PERCENT" ? 0.05 : 0.05}
                          value={limitValue ?? ""}
                          aria-label={limitMode === "PERCENT" ? "Limit, % from the signal price" : "Limit price in rupees"}
                          onChange={(e) => setLimitValue(e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
                        />
                        {limitMode === "PERCENT" && <span className="text-sm text-brand-navy/50">%</span>}
                      </div>
                      <p className="text-xs text-brand-navy/40">
                        {limitMode === "PERCENT"
                          ? `A ${direction === "LONG" ? "buy" : "sell"} limit ${direction === "LONG" ? "below" : "above"} the signal candle's close by this much.`
                          : `A ${direction === "LONG" ? "buy" : "sell"} limit at this exact price.`}{" "}
                        It fills when price reaches it (or better) and is cancelled at the end of the day if it doesn&apos;t. Exits stay at market.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <PositionSizingFields
              mode={positionSizingMode}
              value={positionSizingValue}
              onModeChange={setPositionSizingMode}
              onValueChange={setPositionSizingValue}
            />
            {positionSizingMode === "RISK_PERCENT" && !stopLoss.enabled && (
              <p className="-mt-3 text-xs font-medium text-brand-sell">Sizing by risk needs a stop-loss: its distance decides how many shares fit within the amount you risk. Turn the stop-loss on in Risk management below.</p>
            )}
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                Max entries per position
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={maxPyramidEntries}
                onChange={(e) => setMaxPyramidEntries(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
              <p className="mt-1.5 text-xs text-brand-navy/40">1 = a single entry. Higher lets the strategy add to an open position (pyramiding).</p>
            </div>
            {mode !== "WEBHOOK" && <EntryPlanFields state={plan} onChange={setPlan} direction={direction} pyramiding={maxPyramidEntries > 1} />}
          </div>
        </BuilderSection>

        {mode === "WEBHOOK" ? (
          <BuilderSection step={2} title="Entry & exit" subtitle="Triggered by your TradingView alerts">
            <div className="mb-3">
              <WebhookGuide open={!strategyId} />
            </div>
            <p className="text-sm text-brand-navy/60">
              Trades are triggered by an external TradingView alert, not by conditions you build here — there&apos;s
              no entry/exit condition tree to configure. The risk rules below still apply to every position this strategy opens.
            </p>
            <p className="mt-3 text-xs text-brand-navy/40">
              {strategyId
                ? "Your webhook URL is on this strategy's page (Webhook setup). It's shown once when generated — if you didn't copy it, regenerate it there."
                : "Create the strategy, then on its page confirm the alerts are your own and generate your webhook URL. It's shown only once, so copy it then."}
            </p>
          </BuilderSection>
        ) : (
          <>
            <BuilderSection
              step={2}
              title="Entry condition"
              subtitle="When to open a position"
              sectionRef={entryRef}
            >
              {switchedForTime && timeframe !== "1d" && (
                <p className="mb-3 rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-brand-navy/75 ring-1 ring-brand-gold/25">
                  Switched to {STRATEGY_TIMEFRAMES.find((t) => t.value === timeframe)?.label ?? timeframe} candles — time-of-day rules need an intraday timeframe. You can pick another one
                  (1m to 4H) in Position.
                </p>
              )}
              {mode === "NO_CODE" ? (
                entryMode === "SIMPLE" ? (
                  <SimpleConditionPicker node={entryCondition} onChange={setEntryCondition} instruments={instruments} categories={ALL_CATEGORIES} purpose="entry" />
                ) : (
                  <ConditionGroupEditor node={entryCondition} onChange={setEntryCondition} instruments={instruments} />
                )
              ) : (
                <StrategyCodeEditor label="Entry" value={entrySource} onChange={setEntrySource} />
              )}
            </BuilderSection>

            <BuilderSection
              step={3}
              title="Exit condition"
              subtitle="Optional — a rule that closes the position"
              sectionRef={exitRef}
            >
              {mode === "NO_CODE" ? (
                <>
                  {exitConditionOpen ? (
                    exitMode === "SIMPLE" ? (
                      <SimpleConditionPicker node={exitCondition} onChange={setExitCondition} instruments={instruments} categories={ALL_CATEGORIES} purpose="exit" />
                    ) : (
                      <ConditionGroupEditor node={exitCondition} onChange={setExitCondition} instruments={instruments} />
                    )
                  ) : (
                    <p className="text-sm text-brand-navy/55">
                      No exit rule — positions close on the stop-loss, take-profit or trailing stop in Risk management.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setExitConditionOpen((v) => !v)}
                    className="mt-3 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    {exitConditionOpen ? "− Remove exit rule" : "+ Add an exit rule"}
                  </button>
                </>
              ) : (
                <StrategyCodeEditor label="Exit" value={exitSource} onChange={setExitSource} />
              )}
            </BuilderSection>
          </>
        )}

        <BuilderSection step={mode === "WEBHOOK" ? 3 : 4} title="Risk management" subtitle="Stop-loss, take-profit and trailing stop" sectionRef={riskRef}>
          <RiskManagementFields
            stopLoss={stopLoss}
            target={target}
            trailingSl={trailingSl}
            onStopLossChange={setStopLoss}
            onTargetChange={setTarget}
            onTrailingSlChange={setTrailingSl}
          />
          {mode !== "WEBHOOK" && (
            <StagedTargetsFields
              rows={targetRows}
              direction={direction}
              singleTargetOn={target.enabled}
              onChange={(rows) => {
                setTargetRows(rows);
                // Staged targets replace the single Target, so adding them turns it off.
                if (rows.length > 0 && target.enabled) setTarget({ ...target, enabled: false });
              }}
            />
          )}
          {mode !== "WEBHOOK" && intraday && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SessionTimeField
                label="No new entries after"
                hint="No position is opened at or after this time."
                value={noEntryAfterMinute}
                fallback={14 * 60 + 30}
                onChange={setNoEntryAfterMinute}
              />
              {productType === "INTRADAY" && (
              <SessionTimeField
                label="Square off at"
                hint="Open positions close at this time. Intraday positions are never carried overnight."
                value={squareOffMinute}
                fallback={DEFAULT_SQUARE_OFF_MINUTE}
                onChange={setSquareOffMinute}
              />
              )}
            </div>
          )}
          {mode !== "WEBHOOK" && (
            <p className="mt-3 text-xs text-brand-navy/40">
              These and the exit rule all stay active — whichever triggers first closes the position.
            </p>
          )}
        </BuilderSection>

        {mode === "NO_CODE" && usedPatterns.length > 0 && (
          <BuilderSection step={5} title="What's in this strategy" subtitle="What each indicator and pattern in your rules looks like, and when it fires">
            <div className="grid gap-3 lg:grid-cols-2">
              {usedPatterns.map((p) =>
                p.family === "CANDLE_PATTERN" ? (
                  <div key={`c:${p.pattern}:${p.atLevel ?? ""}`}>
                    <p className="mb-1.5 text-xs font-semibold text-brand-navy/70">{CANDLE_PATTERN_BY_KIND.get(p.pattern)?.label ?? p.pattern} · candle pattern</p>
                    <CandlePatternIllustration pattern={p.pattern} atLevel={p.atLevel} />
                  </div>
                ) : p.family === "CHART_PATTERN" ? (
                  <div key={`g:${p.pattern}`}>
                    <p className="mb-1.5 text-xs font-semibold text-brand-navy/70">{CHART_PATTERN_BY_KIND.get(p.pattern)?.label ?? p.pattern} · chart pattern</p>
                    <ChartPatternIllustration pattern={p.pattern} />
                  </div>
                ) : p.family === "VOLUME_PATTERN" ? (
                  <div key={`v:${p.pattern}`}>
                    <p className="mb-1.5 text-xs font-semibold text-brand-navy/70">{VOLUME_PATTERN_BY_KIND.get(p.pattern)?.label ?? p.pattern} · volume pattern</p>
                    <VolumePatternIllustration pattern={p.pattern} />
                  </div>
                ) : (
                  <div key={`i:${p.pattern}`}>
                    <p className="mb-1.5 text-xs font-semibold text-brand-navy/70">{INDICATOR_BY_KIND.get(p.pattern)?.label ?? p.pattern} · indicator</p>
                    <IndicatorIllustration kind={p.pattern} params={p.params} />
                  </div>
                ),
              )}
            </div>
          </BuilderSection>
        )}

        {mode !== "WEBHOOK" && (
          <BuilderSection
            step={mode === "NO_CODE" && usedPatterns.length > 0 ? 6 : 5}
            title="See it in action"
            subtitle="Where this strategy would have entered and exited recently"
          >
            <StrategyPreview buildInput={buildInput} direction={direction} />
          </BuilderSection>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : strategyId ? "Save changes" : "Create strategy"}
        </button>
      </form>
      </ExitTimeContext.Provider>
      </ConditionOverridesContext.Provider>
      </StrategyTimeframeContext.Provider>

      {feasibilityIssues && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setFeasibilityIssues(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-sell/10 text-brand-sell">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-navy">
                  {feasibilityIssues.length > 1 ? "This strategy isn't feasible yet" : "This strategy can't be saved yet"}
                </p>
                <p className="mt-1 text-xs text-brand-navy/50">
                  {feasibilityIssues.length > 1
                    ? "A few things about this strategy can't actually work in real trading — fix these and try again:"
                    : "Here's what's stopping it:"}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {feasibilityIssues.map((issue, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 rounded-lg bg-brand-sell/5 p-3 text-sm text-brand-navy/80">
                  <span className="flex gap-2">
                    <span className="mt-0.5 text-brand-sell">•</span>
                    <span>{issue.message}</span>
                  </span>
                  {issue.section && (
                    <button
                      type="button"
                      onClick={() => goToSection(issue.section)}
                      className="shrink-0 whitespace-nowrap text-xs font-semibold text-brand-primary underline hover:text-brand-primary-light"
                    >
                      Fix it →
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setFeasibilityIssues(null)}
                className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-primary-light"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showDraftToast && (
        <DraftAutoSaveToast
          dontRemind={dontRemindChecked}
          onDontRemindChange={handleDontRemindChange}
          onDismiss={dismissDraftToast}
        />
      )}
    </>
  );
}
