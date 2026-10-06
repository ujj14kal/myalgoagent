import { DEFAULT_RISK_OPTIONS, MAX_LEVERAGE, type RiskOptions } from "@/lib/trading-engine/risk-options";
import type { RiskUnit } from "@/lib/trading-engine/step";

// The agent's `risk_options` argument → RiskOptions. Fields left out keep `base` (the saved ones, or the defaults);
// null clears an optional one. Throws a readable error the model can fix.

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const UNITS: RiskUnit[] = ["PERCENT", "POINTS", "ATR_MULTIPLE", "R_MULTIPLE"];

export function riskOptionsFrom(v: unknown, base: RiskOptions = DEFAULT_RISK_OPTIONS): RiskOptions | undefined {
  if (v === undefined) return undefined;
  if (v === null) return DEFAULT_RISK_OPTIONS;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("risk_options: give an object.");
  const o = v as Record<string, unknown>;
  const out: RiskOptions = { ...base };
  if ("leverage" in o) {
    const lev = num(o.leverage);
    if (lev === undefined || lev < 1 || lev > MAX_LEVERAGE) throw new Error(`risk_options.leverage: a number from 1 to ${MAX_LEVERAGE} (intraday only).`);
    out.leverage = lev;
  }
  if ("tp_sl_reference" in o) {
    const r = String(o.tp_sl_reference).toLowerCase();
    if (r !== "price" && r !== "margin") throw new Error('risk_options.tp_sl_reference: "price" or "margin".');
    out.reference = r === "margin" ? "MARGIN" : "PRICE";
  }
  if ("break_even" in o) {
    if (o.break_even === null) out.breakEven = null;
    else {
      const be = (o.break_even ?? {}) as Record<string, unknown>;
      const value = num(be.value);
      const unit = (UNITS.includes(be.unit as RiskUnit) ? be.unit : "PERCENT") as RiskUnit;
      if (!value || value <= 0) throw new Error("risk_options.break_even.value: how far price must move in favour before the stop moves to the entry (above zero).");
      out.breakEven = { unit, value };
    }
  }
  for (const [key, field] of [["max_daily_loss_pct", "maxDailyLossPercent"], ["max_drawdown_pct", "maxDrawdownPercent"]] as const) {
    if (!(key in o)) continue;
    if (o[key] === null) out[field] = null;
    else {
      const n = num(o[key]);
      if (n === undefined || n <= 0 || n > 100) throw new Error(`risk_options.${key}: a percentage above 0 and at most 100, or null for none.`);
      out[field] = n;
    }
  }
  return out;
}

export const riskOptionsSchema = {
  type: "object",
  description:
    "Trading-system risk options. leverage: intraday buying power as a multiple of capital (1–20; INTRADAY product only — the price is never multiplied, only how many shares the capital buys). tp_sl_reference: \"price\" (default: % stop/targets are moves in the share's price) or \"margin\" (they are returns on the margin a leveraged position uses: at 5×, a 10% stop on margin = a 2% price move; needs leverage > 1). break_even: {value, unit} moves the stop to the entry once price moves that far in favour (unit PERCENT/POINTS/ATR_MULTIPLE/R_MULTIPLE). max_daily_loss_pct: no new positions for the rest of the day once the day's loss reaches this % of capital. max_drawdown_pct: no new positions at all once capital falls this % below its peak. Use only when the user asks for them.",
  properties: {
    leverage: { type: "number" },
    tp_sl_reference: { type: "string", enum: ["price", "margin"] },
    break_even: { anyOf: [{ type: "object", properties: { value: { type: "number" }, unit: { type: "string", enum: UNITS } }, required: ["value"] }, { type: "null" }] },
    max_daily_loss_pct: { anyOf: [{ type: "number" }, { type: "null" }] },
    max_drawdown_pct: { anyOf: [{ type: "number" }, { type: "null" }] },
  },
};
