import type { IndicatorKind } from "@/lib/strategy/types";
import { INDICATOR_BY_KIND } from "@/lib/strategy/indicator-catalog";

/** One indicator drawn on a chart, with its own id (so e.g. SMA(20) and
 * SMA(50) can coexist) and user-editable params. */
export interface ActiveIndicatorInstance {
  id: string;
  kind: IndicatorKind;
  params: number[];
}

export function instanceFromDefaults(kind: IndicatorKind): ActiveIndicatorInstance {
  const def = INDICATOR_BY_KIND.get(kind);
  return { id: crypto.randomUUID(), kind, params: def ? [...def.defaults] : [] };
}

// Maps the old hardcoded overlay/oscillator toggle keys (pre-catalog chart
// layouts) to a representative catalog indicator, so a previously saved
// layout still shows *something* recognizable instead of silently going
// blank. Multi-series legacy groups (e.g. "bollinger" drew 3 lines) degrade
// to their single most representative series — an acceptable one-time
// loss of fidelity for a purely cosmetic, re-editable preference.
const LEGACY_KEY_MAP: Record<string, { kind: IndicatorKind; params: number[] }> = {
  sma20: { kind: "SMA", params: [20] },
  ema50: { kind: "EMA", params: [50] },
  bollinger: { kind: "BB_UPPER", params: [20, 2] },
  vwap: { kind: "VWAP", params: [] },
  donchian: { kind: "DONCHIAN_UPPER", params: [20] },
  pivots: { kind: "PIVOT_PP", params: [] },
  rsi: { kind: "RSI", params: [14] },
  macd: { kind: "MACD_LINE", params: [12, 26, 9] },
  atr: { kind: "ATR", params: [14] },
  adx: { kind: "ADX", params: [14] },
  stochastic: { kind: "STOCH_K", params: [14, 3] },
  cci: { kind: "CCI", params: [20] },
  roc: { kind: "ROC", params: [12] },
  obv: { kind: "OBV", params: [] },
  williamsR: { kind: "WILLIAMS_R", params: [14] },
  mfi: { kind: "MFI", params: [14] },
  awesomeOscillator: { kind: "AWESOME_OSCILLATOR", params: [] },
  aroon: { kind: "AROON_UP", params: [25] },
  chaikinMoneyFlow: { kind: "CMF", params: [20] },
};

/** Accepts either the old `string[]` of toggle keys or the new
 * `ActiveIndicatorInstance[]` shape (already-saved layouts vs. fresh ones)
 * and always returns the new shape. */
export function normalizeIndicatorInstances(saved: unknown): ActiveIndicatorInstance[] {
  if (!Array.isArray(saved)) return [];

  return saved
    .map((entry): ActiveIndicatorInstance | null => {
      if (typeof entry === "string") {
        const legacy = LEGACY_KEY_MAP[entry];
        return legacy ? { id: crypto.randomUUID(), kind: legacy.kind, params: legacy.params } : null;
      }
      if (entry && typeof entry === "object" && "kind" in entry && "params" in entry) {
        const e = entry as { id?: string; kind: IndicatorKind; params: number[] };
        if (!INDICATOR_BY_KIND.has(e.kind)) return null;
        return { id: e.id ?? crypto.randomUUID(), kind: e.kind, params: e.params };
      }
      return null;
    })
    .filter((v): v is ActiveIndicatorInstance => v !== null);
}
