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

const UNIT_OPTIONS: { value: RiskUnit; label: string }[] = [
  { value: "PERCENT", label: "%" },
  { value: "POINTS", label: "Points" },
  { value: "ATR_MULTIPLE", label: "× ATR(14)" },
];

/**
 * The price a stop-loss, target or trailing stop works out to for an example entry, so "100 points" or "2%" is never
 * left abstract. Every real trade uses its own entry price; this only shows the arithmetic.
 */
export function legPrice(kind: "stop" | "target" | "trail", leg: Pick<RiskLegState, "unit" | "value">, entry: number, direction: "LONG" | "SHORT"): number | null {
  if (!(entry > 0) || !(leg.value > 0) || leg.unit === "ATR_MULTIPLE") return null;
  const move = leg.unit === "POINTS" ? leg.value : (entry * leg.value) / 100;
  // A target is in the trade's favour; a stop (and a trailing stop's starting level) is against it.
  const favour = kind === "target" ? 1 : -1;
  const sign = direction === "LONG" ? 1 : -1;
  const p = entry + favour * sign * move;
  return p > 0 ? Math.round(p * 100) / 100 : null;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function legExample(kind: "stop" | "target" | "trail", leg: RiskLegState, entry: number | null, direction: "LONG" | "SHORT", entryIsReal: boolean): string {
  const what = kind === "target" ? "Target" : kind === "stop" ? "Stop loss" : "Trailing stop starts at";
  const amount = leg.unit === "POINTS" ? `${leg.value} points` : leg.unit === "PERCENT" ? `${leg.value}%` : `${leg.value} × ATR(14)`;
  const dir = kind === "target" ? (direction === "LONG" ? "above" : "below") : direction === "LONG" ? "below" : "above";
  if (leg.unit === "ATR_MULTIPLE") return `${what} ${amount} ${dir} the entry price — worked out from the stock's volatility at the time of each trade.`;
  const e = entry ?? 1000;
  const p = legPrice(kind, leg, e, direction);
  if (p === null) return `${what} ${amount} ${dir} the entry price.`;
  return `${what} ${amount} ${dir} the entry: ${entryIsReal ? "at today's price" : "for an entry at"} ${rupees(e)} that is ${rupees(p)} (${direction === "LONG" ? "long" : "short"}). Each trade uses its own entry price.`;
}

function RiskLegRow({
  kind,
  label,
  hint,
  leg,
  onChange,
  direction,
  entry,
}: {
  kind: "stop" | "target" | "trail";
  label: string;
  hint: string;
  leg: RiskLegState;
  onChange: (leg: RiskLegState) => void;
  direction: "LONG" | "SHORT";
  entry: number | null;
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
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {leg.enabled && leg.value > 0 && <p className="mt-2 text-xs leading-relaxed text-brand-navy/55">{legExample(kind, leg, entry, direction, entry !== null)}</p>}
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
}: {
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
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <RiskLegRow
          kind="stop"
          direction={direction}
          entry={entryPrice}
          label="Stop loss"
          hint="Exit automatically if price moves against you by this much."
          leg={stopLoss}
          onChange={onStopLossChange}
        />
        <RiskLegRow
          kind="target"
          direction={direction}
          entry={entryPrice}
          label="Target"
          hint="Exit automatically once this much profit is reached."
          leg={target}
          onChange={onTargetChange}
        />
        <RiskLegRow
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
