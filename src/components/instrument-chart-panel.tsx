"use client";

import { useMemo, useState } from "react";
import CandlestickChart, { type Overlay } from "@/components/candlestick-chart";
import RsiChart from "@/components/rsi-chart";
import type { Candle } from "@/lib/market-data";
import type { IndicatorPoint } from "@/lib/indicators";

const TOGGLES = [
  { key: "sma20", label: "SMA (20)", color: "#bda360" },
  { key: "ema50", label: "EMA (50)", color: "#466fff" },
] as const;

type ToggleKey = (typeof TOGGLES)[number]["key"];

export default function InstrumentChartPanel({
  candles,
  sma20,
  ema50,
  rsi14,
}: {
  candles: Candle[];
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  rsi14: IndicatorPoint[];
}) {
  const [active, setActive] = useState<Set<ToggleKey>>(new Set(["sma20"]));
  const [showRsi, setShowRsi] = useState(false);

  const overlays: Overlay[] = useMemo(() => {
    const indicatorData: Record<ToggleKey, IndicatorPoint[]> = { sma20, ema50 };
    return TOGGLES.filter((t) => active.has(t.key)).map((t) => ({
      label: t.label,
      color: t.color,
      points: indicatorData[t.key],
    }));
  }, [active, sma20, ema50]);

  function toggle(key: ToggleKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {TOGGLES.map((t) => (
          <button
            key={t.key}
            onClick={() => toggle(t.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              active.has(t.key)
                ? "border-transparent text-white"
                : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
            }`}
            style={active.has(t.key) ? { backgroundColor: t.color } : undefined}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setShowRsi((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            showRsi
              ? "border-transparent bg-brand-blue text-white"
              : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
          }`}
        >
          RSI (14)
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
        <CandlestickChart candles={candles} overlays={overlays} />
      </div>

      {showRsi && (
        <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            RSI (14) — 70 overbought / 30 oversold
          </p>
          <RsiChart points={rsi14} />
        </div>
      )}
    </div>
  );
}
