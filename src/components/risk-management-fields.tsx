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

function RiskLegRow({
  label,
  hint,
  leg,
  onChange,
}: {
  label: string;
  hint: string;
  leg: RiskLegState;
  onChange: (leg: RiskLegState) => void;
}) {
  return (
    <div className="rounded-xl border border-brand-navy/10 p-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={leg.enabled}
          onChange={(e) => onChange({ ...leg, enabled: e.target.checked })}
          className="h-4 w-4 rounded border-brand-navy/30"
        />
        <span className="text-sm font-medium text-brand-navy">{label}</span>
      </label>
      <p className="mt-0.5 text-xs text-brand-navy/40">{hint}</p>
      {leg.enabled && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            value={leg.value}
            onChange={(e) => onChange({ ...leg, value: Number(e.target.value) })}
            className="w-24 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary"
          />
          <select
            value={leg.unit}
            onChange={(e) => onChange({ ...leg, unit: e.target.value as RiskUnit })}
            className="rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      )}
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
}: {
  stopLoss: RiskLegState;
  target: RiskLegState;
  trailingSl: RiskLegState;
  onStopLossChange: (leg: RiskLegState) => void;
  onTargetChange: (leg: RiskLegState) => void;
  onTrailingSlChange: (leg: RiskLegState) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
        Risk management
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <RiskLegRow
          label="Stop loss"
          hint="Exit automatically if price moves against you by this much."
          leg={stopLoss}
          onChange={onStopLossChange}
        />
        <RiskLegRow
          label="Target"
          hint="Exit automatically once this much profit is reached."
          leg={target}
          onChange={onTargetChange}
        />
        <RiskLegRow
          label="Trailing stop loss"
          hint="Stop trails the best price reached since entry, locking in gains."
          leg={trailingSl}
          onChange={onTrailingSlChange}
        />
      </div>
    </div>
  );
}
