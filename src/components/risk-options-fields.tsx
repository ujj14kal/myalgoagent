"use client";

import { useState } from "react";
import type { RiskUnit } from "@/lib/trading-engine/step";
import { MAX_LEVERAGE, riskExample, riskOptionsProblem, type RiskOptions } from "@/lib/trading-engine/risk-options";
import type { RiskLegState } from "@/components/risk-management-fields";

// Trading-system risk options: what the stops and targets are measured against (the share's price, or the margin a
// leveraged intraday position uses), how much leverage, a break-even rule and the system's loss limits — with every
// figure of a worked example shown, so nothing about leverage is left abstract.

const numberCls =
  "w-20 min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none [appearance:textfield] focus:border-brand-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const selectCls = "min-w-0 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-sm outline-none focus:border-brand-primary";
const rupees = (n: number | null, signed = false) => (n == null ? "—" : `${signed && n > 0 ? "+" : n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`);

export default function RiskOptionsFields({
  value,
  onChange,
  productType,
  stopLoss,
  target,
  entryPrice,
  webhook = false,
}: {
  value: RiskOptions;
  onChange: (o: RiskOptions) => void;
  productType: "INTRADAY" | "DELIVERY";
  stopLoss: RiskLegState;
  target: RiskLegState;
  /** The stock's latest price (the worked example's entry); ₹100 until it loads. */
  entryPrice: number | null;
  /** Webhook strategies: no break-even or loss limits (their trades come straight from alerts). */
  webhook?: boolean;
}) {
  const [capital, setCapital] = useState(20_000);
  const set = (patch: Partial<RiskOptions>) => onChange({ ...value, ...patch });
  const intraday = productType === "INTRADAY";
  const problem = riskOptionsProblem(value, { productType, stopLossOn: stopLoss.enabled });
  const entry = entryPrice ?? 100;
  const ex = riskExample({ entry, capital, stop: stopLoss, target, options: value });
  const margin = value.reference === "MARGIN";

  return (
    <div className="mt-4 rounded-xl border border-brand-navy/10 p-3">
      <p className="text-sm font-medium text-brand-navy">Leverage, TP/SL reference and limits</p>
      <p className="mt-0.5 text-xs text-brand-navy/45">System-level choices: how much position each rupee of capital carries, what your stop-loss and target percentages are measured against, and when the system stops opening new positions.</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/65">
            <span className="w-32 font-semibold text-brand-navy">Intraday leverage</span>
            <input type="number" min={1} max={MAX_LEVERAGE} step="0.5" value={value.leverage} disabled={!intraday} aria-label="Intraday leverage" onChange={(e) => set({ leverage: Math.max(1, Number(e.target.value) || 1), ...(Number(e.target.value) <= 1 ? { reference: "PRICE" } : {}) })} className={`${numberCls} disabled:bg-brand-bg`} />
            <span>×</span>
            <span className="w-full text-[11px] text-brand-navy/45">{intraday ? `Buying power = capital × leverage. Your broker's own limit applies (it varies by stock, usually up to 5×).` : "Delivery positions are bought outright, so leverage applies to intraday only."}</span>
          </label>

          <div className="text-xs text-brand-navy/65">
            <span className="mb-1 block font-semibold text-brand-navy">TP/SL reference</span>
            <div className="flex overflow-hidden rounded-full border border-brand-navy/15" role="radiogroup" aria-label="TP/SL reference">
              {(
                [
                  ["PRICE", "Actual price"],
                  ["MARGIN", "Leverage-adjusted (on margin)"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={value.reference === m}
                  disabled={m === "MARGIN" && !(intraday && value.leverage > 1)}
                  onClick={() => set({ reference: m })}
                  className={`flex-1 px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${value.reference === m ? "bg-brand-primary text-white" : "bg-white text-brand-navy/60 hover:bg-brand-bg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-brand-navy/45">
              {margin
                ? `Your % stop-loss and targets are returns on the margin: at ${value.leverage}×, a ${value.leverage * 2}% stop on margin is a 2% move in the price. The orders still go in at real market prices.`
                : "Your % stop-loss and targets are moves in the share's price. Leverage changes how many shares you hold, never the price."}
            </p>
          </div>

          {!webhook && (
            <>
              <label className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/65">
                <input type="checkbox" checked={!!value.breakEven} onChange={(e) => set({ breakEven: e.target.checked ? { unit: "PERCENT", value: 1 } : null })} className="h-4 w-4 rounded border-brand-navy/30" />
                <span className="font-semibold text-brand-navy">Break-even</span>: move the stop to the entry once price moves
                {value.breakEven && (
                  <>
                    <input type="number" min={0} step="any" value={value.breakEven.value} aria-label="Break-even trigger" onChange={(e) => set({ breakEven: { ...value.breakEven!, value: Number(e.target.value) } })} className={numberCls} />
                    <select value={value.breakEven.unit} aria-label="Break-even unit" onChange={(e) => set({ breakEven: { ...value.breakEven!, unit: e.target.value as RiskUnit } })} className={selectCls}>
                      <option value="PERCENT">%</option>
                      <option value="POINTS">points</option>
                      <option value="ATR_MULTIPLE">× ATR(14)</option>
                      <option value="R_MULTIPLE">R (× stop)</option>
                    </select>
                  </>
                )}
                in your favour
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-brand-navy/65">
                <label className="flex items-center gap-2">
                  <span className="font-semibold text-brand-navy">Max daily loss</span>
                  <input type="number" min={0} max={100} step="any" placeholder="none" value={value.maxDailyLossPercent ?? ""} aria-label="Maximum daily loss" onChange={(e) => set({ maxDailyLossPercent: e.target.value === "" ? null : Number(e.target.value) })} className={numberCls} />% of capital
                </label>
                <label className="flex items-center gap-2">
                  <span className="font-semibold text-brand-navy">Max drawdown</span>
                  <input type="number" min={0} max={100} step="any" placeholder="none" value={value.maxDrawdownPercent ?? ""} aria-label="Maximum drawdown" onChange={(e) => set({ maxDrawdownPercent: e.target.value === "" ? null : Number(e.target.value) })} className={numberCls} />% from the peak
                </label>
              </div>
              <p className="text-[11px] text-brand-navy/45">After the daily loss is reached no new position opens that day; after the drawdown, none at all. Open positions still exit by their own rules.</p>
            </>
          )}
          {problem && <p className="text-xs font-medium text-brand-sell">{problem}</p>}
        </div>

        <div className="rounded-lg bg-brand-bg p-3 text-xs text-brand-navy/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-brand-navy">Worked example (long)</p>
            <label className="flex items-center gap-1.5">
              Capital ₹
              <input type="number" min={1} step="1000" value={capital} aria-label="Example capital" onChange={(e) => setCapital(Math.max(1, Number(e.target.value) || 1))} className={`${numberCls} w-24`} />
            </label>
          </div>
          <table className="mt-2 w-full">
            <tbody className="[&_td]:py-0.5 [&_td:last-child]:text-right [&_td:last-child]:font-semibold [&_td:last-child]:text-brand-navy">
              <tr>
                <td>Entry price{entryPrice ? " (today's)" : ""}</td>
                <td>{rupees(ex.entry)}</td>
              </tr>
              <tr>
                <td>Shares (at {ex.leverage}× leverage)</td>
                <td>{ex.quantity.toLocaleString("en-IN")}</td>
              </tr>
              <tr>
                <td>Leveraged exposure (position value)</td>
                <td>{rupees(ex.exposure)}</td>
              </tr>
              <tr>
                <td>Margin used (your capital in it)</td>
                <td>{rupees(ex.margin)}</td>
              </tr>
              <tr>
                <td>Stop-loss price · move</td>
                <td>
                  {rupees(ex.stopPrice)} · {pct(ex.stopPctOfPrice)}
                </td>
              </tr>
              <tr>
                <td>Loss at the stop · on margin</td>
                <td className="!text-brand-sell">
                  {rupees(ex.stopPnl, true)} · {pct(ex.stopPctOfMargin)}
                </td>
              </tr>
              <tr>
                <td>Target price · move</td>
                <td>
                  {rupees(ex.targetPrice)} · {pct(ex.targetPctOfPrice)}
                </td>
              </tr>
              <tr>
                <td>Profit at the target · on margin</td>
                <td className="!text-brand-buy">
                  {rupees(ex.targetPnl, true)} · {pct(ex.targetPctOfMargin)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-brand-navy/45">Before charges. Stops and targets execute at the actual market prices shown; leverage only changes the size of the position and so the ₹ and % on your margin. A short is the mirror image. Every real trade uses its own entry price.</p>
        </div>
      </div>
    </div>
  );
}
