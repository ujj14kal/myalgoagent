"use client";

import type { RiskUnit } from "@/lib/trading-engine/step";

export interface RiskLegState {
  enabled: boolean;
  unit: RiskUnit;
  value: number;
}

export function defaultRiskLeg(value: number): RiskLegState {
  return { enabled: false, unit: "PERCENT", value };
}

/** What a stop-loss / target is measured on: the share's price, or the capital the user trades with. */
export type RiskBasisChoice = "PRICE" | "CAPITAL";

const UNIT_OPTIONS: Record<RiskBasisChoice, { value: RiskUnit; label: string }[]> = {
  PRICE: [
    { value: "PERCENT", label: "% of share price" },
    { value: "POINTS", label: "Points (₹ per share)" },
    { value: "ATR_MULTIPLE", label: "× ATR(14)" },
  ],
  CAPITAL: [
    { value: "PERCENT", label: "% of capital" },
    { value: "POINTS", label: "₹ of capital" },
    { value: "ATR_MULTIPLE", label: "× ATR(14)" },
  ],
};
/** A target can also be a risk/reward multiple: R = the stop-loss distance. */
const targetUnits = (basis: RiskBasisChoice) => [...UNIT_OPTIONS[basis], { value: "R_MULTIPLE" as RiskUnit, label: "R (× stop)" }];

/**
 * The price a stop-loss, target or trailing stop works out to for an example entry, so "100 points" or "2%" is never
 * left abstract. Every real trade uses its own entry price; this only shows the arithmetic.
 */
export function legPrice(kind: "stop" | "target" | "trail", leg: Pick<RiskLegState, "unit" | "value">, entry: number, direction: "LONG" | "SHORT", stopDistance?: number | null): number | null {
  if (!(entry > 0) || !(leg.value > 0) || leg.unit === "ATR_MULTIPLE") return null;
  if (leg.unit === "R_MULTIPLE" && !(stopDistance && stopDistance > 0)) return null;
  const move = leg.unit === "POINTS" ? leg.value : leg.unit === "R_MULTIPLE" ? leg.value * stopDistance! : (entry * leg.value) / 100;
  // A target is in the trade's favour; a stop (and a trailing stop's starting level) is against it.
  const favour = kind === "target" ? 1 : -1;
  const sign = direction === "LONG" ? 1 : -1;
  const p = entry + favour * sign * move;
  return p > 0 ? Math.round(p * 100) / 100 : null;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** The illustration capital used where the real one isn't known (the strategy's capital is chosen when it is backtested or run). */
const EXAMPLE_CAPITAL = 100_000;

function legExample(kind: "stop" | "target" | "trail", leg: RiskLegState, entry: number | null, direction: "LONG" | "SHORT", entryIsReal: boolean, stop?: RiskLegState, basis: RiskBasisChoice = "PRICE"): string {
  const what = kind === "target" ? "Target" : kind === "stop" ? "Stop loss" : "Trailing stop starts at";
  if (basis === "CAPITAL" && (leg.unit === "PERCENT" || leg.unit === "POINTS")) {
    const money = leg.unit === "PERCENT" ? (EXAMPLE_CAPITAL * leg.value) / 100 : leg.value;
    const verb = kind === "target" ? "makes" : kind === "stop" ? "loses" : "starts trailing at a";
    return `${what}: the trade ${verb === "starts trailing at a" ? "trails by an amount equal to" : verb} ${leg.unit === "PERCENT" ? `${leg.value}% of your capital` : rupees(leg.value)}${leg.unit === "PERCENT" ? ` — ${rupees(money)} on an example ₹1,00,000` : ""}. The price it triggers at depends on how many shares you hold, so it moves with your position size.`;
  }
  const amount = leg.unit === "POINTS" ? `${leg.value} points` : leg.unit === "PERCENT" ? `${leg.value}%` : leg.unit === "R_MULTIPLE" ? `${leg.value}R (${leg.value} × the stop-loss distance)` : `${leg.value} × ATR(14)`;
  const dir = kind === "target" ? (direction === "LONG" ? "above" : "below") : direction === "LONG" ? "below" : "above";
  if (leg.unit === "ATR_MULTIPLE") return `${what} ${amount} ${dir} the entry price — worked out from the stock's volatility at the time of each trade.`;
  const e = entry ?? 1000;
  if (leg.unit === "R_MULTIPLE" && !stop?.enabled) return "A target in R needs a stop-loss: R is the stop-loss distance. Turn the stop-loss on.";
  const stopPx = stop?.enabled ? legPrice("stop", stop, e, direction) : null;
  const p = legPrice(kind, leg, e, direction, stopPx !== null ? Math.abs(e - stopPx) : null);
  if (p === null) return `${what} ${amount} ${dir} the entry price.`;
  return `${what} ${amount} ${dir} the entry: ${entryIsReal ? "at today's price" : "for an entry at"} ${rupees(e)} that is ${rupees(p)} (${direction === "LONG" ? "long" : "short"}). Each trade uses its own entry price.`;
}

function RiskLegRow({
  basis,
  kind,
  label,
  hint,
  leg,
  onChange,
  direction,
  entry,
  stop,
}: {
  basis: RiskBasisChoice;
  kind: "stop" | "target" | "trail";
  label: string;
  hint: string;
  leg: RiskLegState;
  onChange: (leg: RiskLegState) => void;
  direction: "LONG" | "SHORT";
  entry: number | null;
  /** Targets: the stop-loss, for targets set in R. */
  stop?: RiskLegState;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-brand-navy/10 p-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={leg.enabled}
          onChange={(e) => onChange({ ...leg, enabled: e.target.checked })}
          className="h-4 w-4 shrink-0 rounded border-brand-navy/30"
        />
        <span className="text-sm font-medium text-brand-navy">{label}</span>
      </label>
      <p className="mt-0.5 flex-1 text-xs text-brand-navy/40">{hint}</p>
      {leg.enabled && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            value={leg.value}
            onChange={(e) => onChange({ ...leg, value: Number(e.target.value) })}
            className="w-16 min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none [appearance:textfield] focus:border-brand-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <select
            value={leg.unit}
            onChange={(e) => onChange({ ...leg, unit: e.target.value as RiskUnit })}
            className="min-w-0 flex-1 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary"
          >
            {(kind === "target" ? targetUnits(basis) : UNIT_OPTIONS[basis]).map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {leg.enabled && leg.value > 0 && <p className="mt-2 text-xs leading-relaxed text-brand-navy/55">{legExample(kind, leg, entry, direction, entry !== null, stop, basis)}</p>}
    </div>
  );
}

export default function RiskManagementFields({
  stopLoss,
  target,
  trailingSl,
  onStopLossChange,
  onTargetChange,
  onTrailingSlChange,
  direction = "LONG",
  entryPrice = null,
  basis,
  onBasisChange,
  sizingByRisk = false,
}: {
  /** What the legs are measured on. Omit to hide the choice (everything is on the share price). */
  basis?: RiskBasisChoice;
  onBasisChange?: (b: RiskBasisChoice) => void;
  /** Risk-based position sizing works out the shares from a share-price stop, so capital can't be chosen with it. */
  sizingByRisk?: boolean;
  direction?: "LONG" | "SHORT";
  /** The stock's latest price, used as the example entry; a ₹1,000 example is used until it loads. */
  entryPrice?: number | null;
  stopLoss: RiskLegState;
  target: RiskLegState;
  trailingSl: RiskLegState;
  onStopLossChange: (leg: RiskLegState) => void;
  onTargetChange: (leg: RiskLegState) => void;
  onTrailingSlChange: (leg: RiskLegState) => void;
}) {
  const b: RiskBasisChoice = basis ?? "PRICE";
  return (
    <div>
      {onBasisChange && (
        <div className="mb-3 rounded-xl bg-brand-bg p-3">
          <p className="text-xs font-semibold text-brand-navy">Stop-loss and target are measured on</p>
          <div className="mt-2 flex w-fit overflow-hidden rounded-full border border-brand-navy/15" role="radiogroup" aria-label="Stop-loss and target are measured on">
            {([["PRICE", "Share price"], ["CAPITAL", "Capital"]] as const).map(([v, text]) => (
              <button key={v} type="button" role="radio" aria-checked={b === v} disabled={v === "CAPITAL" && sizingByRisk} onClick={() => onBasisChange(v)} className={`px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${b === v ? "bg-brand-primary text-white" : "bg-white text-brand-navy/60 hover:bg-brand-bg"}`}>
                {text}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-brand-navy/55">
            {b === "PRICE"
              ? "A % is a move in the share's price and points are ₹ per share. The same move whatever you hold."
              : "A % is a share of your capital you are willing to lose or make on the trade, and ₹ is a rupee amount of profit or loss. The price it triggers at depends on how many shares you hold."}
            {sizingByRisk && " Capital can't be used while the position is sized by risk (the shares come from a share-price stop)."}
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <RiskLegRow
          basis={b}
          kind="stop"
          direction={direction}
          entry={entryPrice}
          label="Stop loss"
          hint="Exit automatically if price moves against you by this much."
          leg={stopLoss}
          onChange={onStopLossChange}
        />
        <RiskLegRow
          basis={b}
          kind="target"
          direction={direction}
          entry={entryPrice}
          label="Target"
          hint="Exit automatically once this much profit is reached — or set it as a risk/reward multiple (R) of the stop."
          stop={stopLoss}
          leg={target}
          onChange={onTargetChange}
        />
        <RiskLegRow
          basis={b}
          kind="trail"
          direction={direction}
          entry={entryPrice}
          label="Trailing stop loss"
          hint="Stop trails the best price reached since entry, locking in gains."
          leg={trailingSl}
          onChange={onTrailingSlChange}
        />
      </div>
    </div>
  );
}
