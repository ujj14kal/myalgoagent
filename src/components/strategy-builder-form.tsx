"use client";

import { useRef, useState, useTransition } from "react";
import ConditionGroupEditor, { defaultComparison } from "@/components/condition-group-editor";
import SimpleConditionPicker, { ALL_CATEGORIES, fitsSimpleMode, unwrapForSimpleMode } from "@/components/simple-condition-picker";
import StrategyCodeEditor from "@/components/strategy-code-editor";
import PositionSizingFields from "@/components/position-sizing-fields";
import RiskManagementFields, { type RiskLegState } from "@/components/risk-management-fields";
import { createStrategy, updateStrategy, type StrategyInput } from "@/lib/strategy-actions";
import { NEVER_EXIT_CONDITION, isNeverExitCondition, type FeasibilitySection } from "@/lib/strategy/types";
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

function wrapInGroup(node: ConditionNode): ConditionNode {
  return { kind: "group", op: "AND", children: [node] };
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
  const [duplicateName, setDuplicateName] = useState<StrategyInput | null>(null);
  const [isPending, startTransition] = useTransition();

  const entryRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLDivElement>(null);
  // Risk fields render in one of two places depending on mode (inside the
  // Exit card for NO_CODE/CODE, inside the Webhook card for WEBHOOK) — only
  // one is ever mounted at a time, so both wrappers can safely share this
  // one ref.
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

  function buildInput(confirmDuplicateName?: boolean): StrategyInput {
    const finalExitCondition = exitConditionOpen ? exitCondition : NEVER_EXIT_CONDITION;
    return {
      name,
      instrumentId,
      mode,
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
      confirmDuplicateName,
    };
  }

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
          setDuplicateName(input);
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

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[2fr_2fr_1fr]">
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
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              Build with
            </label>
            <div className="flex overflow-hidden rounded-full border border-brand-navy/15 w-fit">
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

        <div ref={positionSizingRef} className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-brand-navy">Position sizing &amp; pyramiding</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <PositionSizingFields
              mode={positionSizingMode}
              value={positionSizingValue}
              onModeChange={setPositionSizingMode}
              onValueChange={setPositionSizingValue}
            />
            <div>
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
            </div>
          </div>
        </div>

        {mode === "WEBHOOK" ? (
          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="text-sm font-semibold text-brand-navy">Webhook-triggered strategy</p>
            <p className="mt-1 text-sm text-brand-navy/60">
              Trades are triggered by an external TradingView alert, not by conditions you build here — there&apos;s
              no entry/exit condition tree to configure. Stop-loss, target, and trailing stop below still apply to
              every position this strategy opens.
            </p>
            <div ref={riskRef} className="mt-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3">
              <RiskManagementFields
                stopLoss={stopLoss}
                target={target}
                trailingSl={trailingSl}
                onStopLossChange={setStopLoss}
                onTargetChange={setTarget}
                onTrailingSlChange={setTrailingSl}
              />
            </div>
            {strategyId ? (
              <p className="mt-3 text-xs text-brand-navy/40">
                Save your changes, then set up the webhook URL below.
              </p>
            ) : (
              <p className="mt-3 text-xs text-brand-navy/40">
                Create the strategy first — the webhook URL is generated on its detail page.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <div ref={entryRef} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-navy">Entry condition</p>
                {mode === "NO_CODE" && (
                  <button type="button" onClick={toggleEntryMode} className="text-xs font-medium text-brand-primary hover:underline">
                    {entryMode === "SIMPLE" ? "Switch to Advanced" : "Switch to Simple"}
                  </button>
                )}
              </div>
              {mode === "NO_CODE" ? (
                entryMode === "SIMPLE" ? (
                  <SimpleConditionPicker node={entryCondition} onChange={setEntryCondition} instruments={instruments} categories={ALL_CATEGORIES} />
                ) : (
                  <ConditionGroupEditor node={entryCondition} onChange={setEntryCondition} instruments={instruments} />
                )
              ) : (
                <StrategyCodeEditor label="Entry" value={entrySource} onChange={setEntrySource} />
              )}
            </div>

            <div ref={exitRef} className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-brand-navy">Exit condition</p>

              <div ref={riskRef} className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3">
                <RiskManagementFields
                  stopLoss={stopLoss}
                  target={target}
                  trailingSl={trailingSl}
                  onStopLossChange={setStopLoss}
                  onTargetChange={setTarget}
                  onTrailingSlChange={setTrailingSl}
                />
              </div>

              {mode === "NO_CODE" ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setExitConditionOpen((v) => !v)}
                    className="text-xs font-medium text-brand-navy/60 hover:text-brand-primary"
                  >
                    {exitConditionOpen ? "− Remove condition-based exit" : "+ Add a condition-based exit"}
                  </button>
                  {exitConditionOpen && (
                    <div className="mt-2">
                      <div className="mb-2 flex items-center justify-end">
                        <button type="button" onClick={toggleExitMode} className="text-xs font-medium text-brand-primary hover:underline">
                          {exitMode === "SIMPLE" ? "Switch to Advanced" : "Switch to Simple"}
                        </button>
                      </div>
                      {exitMode === "SIMPLE" ? (
                        <SimpleConditionPicker node={exitCondition} onChange={setExitCondition} instruments={instruments} categories={ALL_CATEGORIES} />
                      ) : (
                        <ConditionGroupEditor node={exitCondition} onChange={setExitCondition} instruments={instruments} />
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-brand-navy/40">
                    A stop-loss/target/trailing stop above and a condition-based exit here both stay active if
                    configured — whichever triggers first closes the position.
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <StrategyCodeEditor label="Exit" value={exitSource} onChange={setExitSource} />
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : strategyId ? "Save changes" : "Create strategy"}
        </button>
      </form>

      {duplicateName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDuplicateName(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-semibold text-brand-navy">Strategy name already in use</p>
            <p className="mt-2 text-sm text-brand-navy/60">
              You already have a strategy named &ldquo;{duplicateName.name}&rdquo;. Use it anyway, or pick a
              different name?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDuplicateName(null)}
                className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
              >
                Choose another name
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = { ...duplicateName, confirmDuplicateName: true };
                  setDuplicateName(null);
                  submit(input);
                }}
                className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-primary-light"
              >
                Use this name anyway
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
