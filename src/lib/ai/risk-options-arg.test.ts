import { describe, expect, it } from "vitest";
import { riskOptionsFrom } from "./risk-options-arg";
import { targetsFrom } from "./targets-arg";
import { DEFAULT_RISK_OPTIONS } from "@/lib/trading-engine/risk-options";

describe("risk_options argument", () => {
  it("reads every option", () => {
    expect(riskOptionsFrom({ leverage: 5, tp_sl_reference: "margin", break_even: { value: 1, unit: "PERCENT" }, max_daily_loss_pct: 3, max_drawdown_pct: 10 })).toEqual({ reference: "MARGIN", leverage: 5, breakEven: { unit: "PERCENT", value: 1 }, maxDailyLossPercent: 3, maxDrawdownPercent: 10 });
  });
  it("keeps the saved ones for fields left out, and clears with null", () => {
    const saved = { ...DEFAULT_RISK_OPTIONS, leverage: 5, maxDailyLossPercent: 3 };
    expect(riskOptionsFrom({ max_drawdown_pct: 8 }, saved)).toMatchObject({ leverage: 5, maxDailyLossPercent: 3, maxDrawdownPercent: 8 });
    expect(riskOptionsFrom({ max_daily_loss_pct: null }, saved)?.maxDailyLossPercent).toBeNull();
    expect(riskOptionsFrom(undefined)).toBeUndefined();
    expect(riskOptionsFrom(null)).toEqual(DEFAULT_RISK_OPTIONS);
  });
  it("explains bad values", () => {
    expect(() => riskOptionsFrom({ leverage: 50 })).toThrow(/1 to 20/);
    expect(() => riskOptionsFrom({ tp_sl_reference: "equity" })).toThrow(/price.*margin/);
    expect(() => riskOptionsFrom({ max_daily_loss_pct: 0 })).toThrow(/percentage/);
  });
});

describe("targets with stop rules and R multiples", () => {
  it("reads the brief's ladder: TP1 30% → breakeven, TP2 30% → TP1, TP3 40% trailing", () => {
    const t = targetsFrom([
      { value: 3, unit: "POINTS", exit_percent: 30, lock: "breakeven" },
      { value: 6, unit: "POINTS", exit_percent: 30, lock: "previous" },
      { value: 10, unit: "POINTS", exit_percent: 40, lock: "trail", margin_value: 1.5, margin_unit: "ATR_MULTIPLE" },
    ])!;
    expect(t.map((x) => x.lock)).toEqual([{ mode: "BREAKEVEN" }, { mode: "PREVIOUS" }, { mode: "TRAIL", unit: "ATR_MULTIPLE", value: 1.5 }]);
  });
  it("accepts R-multiple targets and keeps the old fixed/margin rules", () => {
    const t = targetsFrom([{ value: 1, unit: "R_MULTIPLE", exit_percent: 50, lock: "keep" }, { value: 2, unit: "R_MULTIPLE", exit_percent: 50, lock: "margin", margin_value: 0.5 }])!;
    expect(t[0]).toMatchObject({ unit: "R_MULTIPLE", lock: { mode: "KEEP" } });
    expect(t[1].lock).toEqual({ mode: "MARGIN", unit: "PERCENT", value: 0.5 });
    expect(() => targetsFrom([{ value: 3, unit: "PERCENT", exit_percent: 30, lock: "trail" }])).toThrow(/margin_value/);
  });
});
