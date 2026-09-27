"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConditionGroupEditor, { defaultComparison } from "@/components/condition-group-editor";
import SimpleConditionPicker, { ALL_CATEGORIES, fitsSimpleMode, unwrapForSimpleMode } from "@/components/simple-condition-picker";
import StrategyCodeEditor from "@/components/strategy-code-editor";
import PositionSizingFields from "@/components/position-sizing-fields";
import RiskManagementFields, { type RiskLegState } from "@/components/risk-management-fields";
import DraftAutoSaveToast from "@/components/draft-autosave-toast";
import CandlePatternIllustration from "@/components/candle-pattern-illustration";
import StrategyPreview from "@/components/strategy-preview";
import { CANDLE_PATTERN_BY_KIND } from "@/lib/strategy/candle-pattern-catalog";
import type { CandlePatternKind } from "@/lib/candle-patterns";
import { createStrategy, updateStrategy, autoSaveDraftStrategy, type StrategyInput } from "@/lib/strategy-actions";
import { NEVER_EXIT_CONDITION, isNeverExitCondition, type FeasibilitySection } from "@/lib/strategy/types";
import { consumeDraftReminderSkip, setDraftReminderSkipCount } from "@/lib/draft-reminder";
import type { ConditionNode } from "@/lib/strategy";
import type { PositionSizingMode, RiskUnit } from "@/lib/trading-engine/step";

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

/** Every distinct candle pattern (and where it must form) used anywhere in a condition tree. */
function collectCandlePatterns(node: ConditionNode, out: { pattern: CandlePatternKind; atLevel?: "SUPPORT" | "RESISTANCE" }[] = []) {
  if (node.kind === "group") node.children.forEach((c) => collectCandlePatterns(c, out));
  else if (node.kind === "not") collectCandlePatterns(node.child, out);
  else if (node.kind === "signal" && node.signal.family === "CANDLE_PATTERN") {
    const { pattern, atLevel } = node.signal;
    if (!out.some((p) => p.pattern === pattern && p.atLevel === atLevel)) out.push({ pattern, atLevel });
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

function wrapInGroup(node: ConditionNode): ConditionNode {
  return node.kind === "group" ? node : { kind: "group", op: "AND", children: [node] };
}

/** Advanced -> Simple is lossy if the tree doesn't already fit one
 * condition — falls back to a fresh default rather than guessing which
 * part of a bigger tree the user meant to keep. */
function collapseToSimple(node: ConditionNode): ConditionNode {
  return fitsSimpleMode(node) ? unwrapForSimpleMode(node) : defaultComparison();
}

interface StrategyInitial {
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
  const [instrumentId, setInstrumentId] = useState(initial?.instrumentId ?? instruments[0]?.id ?? "");
  const [mode, setMode] = useState<"NO_CODE" | "CODE" | "WEBHOOK">(initial?.mode ?? "NO_CODE");
  const [direction, setDirection] = useState<"LONG" | "SHORT">(initial?.direction ?? "LONG");

  const initialEntryFitsSimple = initial ? fitsSimpleMode(initial.entryCondition) : true;
  const [entryMode, setEntryMode] = useState<"SIMPLE" | "ADVANCED">(initialEntryFitsSimple ? "SIMPLE" : "ADVANCED");
  const [entryCondition, setEntryCondition] = useState<ConditionNode>(
    initial ? (initialEntryFitsSimple ? unwrapForSimpleMode(initial.entryCondition) : initial.entryCondition) : defaultComparison(),
  );

  const initialExitOpen = initial ? !isNeverExitCondition(initial.exitCondition) : false;
  const initialExitFitsSimple = initial ? fitsSimpleMode(initial.exitCondition) : true;
  const [exitConditionOpen, setExitConditionOpen] = useState(initialExitOpen);
  const [exitMode, setExitMode] = useState<"SIMPLE" | "ADVANCED">(initialExitFitsSimple ? "SIMPLE" : "ADVANCED");
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
  const [stopLoss, setStopLoss] = useState<RiskLegState>(
    toRiskLegState(initial?.stopLossEnabled ?? false, initial?.stopLossUnit ?? null, initial?.stopLossValue ?? null, 2),
  );
  const [target, setTarget] = useState<RiskLegState>(
    toRiskLegState(initial?.targetEnabled ?? false, initial?.targetUnit ?? null, initial?.targetValue ?? null, 4),
  );
  const [trailingSl, setTrailingSl] = useState<RiskLegState>(
    toRiskLegState(initial?.trailingSlEnabled ?? false, initial?.trailingSlUnit ?? null, initial?.trailingSlValue ?? null, 1.5),
  );

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
    };
  }
  useEffect(() => {
    buildInputRef.current = buildInput;
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
        if (result?.error === "DUPLICATE_NAME") {
          setFeasibilityIssues([{ message: `You already have a strategy named "${input.name.trim()}". Choose a different name.` }]);
          return;
        }
        if (result?.error) {
          setFeasibilityIssues(parseIssues(result.error));
        }
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setFeasibilityIssues([{ message: err instanceof Error ? err.message : "Something went wrong" }]);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeasibilityIssues(null);
    submit(buildInput());
  }

  function toggleEntryMode() {
    if (entryMode === "SIMPLE") {
      setEntryCondition(wrapInGroup(entryCondition));
      setEntryMode("ADVANCED");
    } else {
      setEntryCondition(collapseToSimple(entryCondition));
      setEntryMode("SIMPLE");
    }
  }

  function toggleExitMode() {
    if (exitMode === "SIMPLE") {
      setExitCondition(wrapInGroup(exitCondition));
      setExitMode("ADVANCED");
    } else {
      setExitCondition(collapseToSimple(exitCondition));
      setExitMode("SIMPLE");
    }
  }

  const usedCandlePatterns =
    mode === "NO_CODE" ? collectCandlePatterns(exitConditionOpen ? exitCondition : NEVER_EXIT_CONDITION, collectCandlePatterns(entryCondition)) : [];

  return (
    <>
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
              <select
                value={instrumentId}
                onChange={(e) => setInstrumentId(e.target.value)}
                required
                className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
              >
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.symbol} — {i.name}
                  </option>
                ))}
              </select>
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
                    className={`px-4 py-1.5 text-sm font-medium ${
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
            <PositionSizingFields
              mode={positionSizingMode}
              value={positionSizingValue}
              onModeChange={setPositionSizingMode}
              onValueChange={setPositionSizingValue}
            />
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
          </div>
        </BuilderSection>

        {mode === "WEBHOOK" ? (
          <BuilderSection step={2} title="Entry & exit" subtitle="Triggered by your TradingView alerts">
            <p className="text-sm text-brand-navy/60">
              Trades are triggered by an external TradingView alert, not by conditions you build here — there&apos;s
              no entry/exit condition tree to configure. The risk rules below still apply to every position this strategy opens.
            </p>
            <p className="mt-3 text-xs text-brand-navy/40">
              {strategyId ? "Save your changes, then set up the webhook URL below." : "Create the strategy first — the webhook URL is generated on its detail page."}
            </p>
          </BuilderSection>
        ) : (
          <>
            <BuilderSection
              step={2}
              title="Entry condition"
              subtitle="When to open a position"
              sectionRef={entryRef}
              action={
                mode === "NO_CODE" ? (
                  <button type="button" onClick={toggleEntryMode} className="text-xs font-medium text-brand-primary hover:underline">
                    {entryMode === "SIMPLE" ? "Switch to Advanced" : "Switch to Simple"}
                  </button>
                ) : null
              }
            >
              {mode === "NO_CODE" ? (
                entryMode === "SIMPLE" ? (
                  <SimpleConditionPicker node={entryCondition} onChange={setEntryCondition} instruments={instruments} categories={ALL_CATEGORIES} />
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
              action={
                mode === "NO_CODE" && exitConditionOpen ? (
                  <button type="button" onClick={toggleExitMode} className="text-xs font-medium text-brand-primary hover:underline">
                    {exitMode === "SIMPLE" ? "Switch to Advanced" : "Switch to Simple"}
                  </button>
                ) : null
              }
            >
              {mode === "NO_CODE" ? (
                <>
                  {exitConditionOpen ? (
                    exitMode === "SIMPLE" ? (
                      <SimpleConditionPicker node={exitCondition} onChange={setExitCondition} instruments={instruments} categories={ALL_CATEGORIES} />
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
            <p className="mt-3 text-xs text-brand-navy/40">
              These and the exit rule all stay active — whichever triggers first closes the position.
            </p>
          )}
        </BuilderSection>

        {mode === "NO_CODE" && usedCandlePatterns.length > 0 && (
          <BuilderSection step={5} title="Candle patterns in this strategy" subtitle="What each selected pattern looks like">
            <div className="grid gap-3 lg:grid-cols-2">
              {usedCandlePatterns.map((p) => (
                <div key={`${p.pattern}:${p.atLevel ?? ""}`}>
                  <p className="mb-1.5 text-xs font-semibold text-brand-navy/70">{CANDLE_PATTERN_BY_KIND.get(p.pattern)?.label ?? p.pattern}</p>
                  <CandlePatternIllustration pattern={p.pattern} atLevel={p.atLevel} />
                </div>
              ))}
            </div>
          </BuilderSection>
        )}

        {mode !== "WEBHOOK" && (
          <BuilderSection
            step={mode === "NO_CODE" && usedCandlePatterns.length > 0 ? 6 : 5}
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
