"use client";

import { useState } from "react";
import CandlestickChart from "@/components/candlestick-chart";
import type { Candle, CandleInterval } from "@/lib/market-data";
import type { Signal } from "@/lib/strategy";
import { useLiveCandle } from "@/lib/market-data/use-live-candle";

/** A read-only chart that also draws the forming candle during market hours (accounts on the live feed). */
export default function LiveCandlestickChart({ candles: initial, markers, symbol, interval, live }: { candles: Candle[]; markers?: Signal[]; symbol: string; interval: CandleInterval; live: boolean }) {
  const [candles, setCandles] = useState(initial);
  const { liveCandle } = useLiveCandle({
    symbol,
    interval,
    enabled: live,
    candles,
    onClosed: (closed) => setCandles((prev) => [...prev.filter((c) => c.time < closed[0].time), ...closed]),
  });
  return <CandlestickChart candles={candles} markers={markers} liveCandle={liveCandle} />;
}
