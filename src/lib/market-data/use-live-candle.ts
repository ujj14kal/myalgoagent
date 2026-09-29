"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle, CandleInterval, Tick } from "./types";
import { applyTicks, bucketStart } from "./live-candle";
import { inMarketWindow } from "@/lib/paper/market-window";

/**
 * The candle forming right now, from live trades polled every 2 s in market
 * hours (accounts on the live feed only — the API answers live:false for
 * everyone else). Finished candles are handed to `onClosed` so the chart's
 * history (and its indicators) include them; `onResync` fires every 5 minutes
 * so the caller can refetch history and correct anything a poll missed.
 */
export function useLiveCandle(opts: {
  symbol: string;
  interval: CandleInterval;
  enabled: boolean;
  candles: Candle[];
  /** Changes whenever the dataset is replaced (e.g. range switch) — restarts the stream. */
  resetKey?: string;
  onClosed?: (closed: Candle[]) => void;
  onResync?: () => void;
}): { liveCandle: Candle | null; quote: Tick | null } {
  const { symbol, interval, enabled, candles, resetKey, onClosed, onResync } = opts;
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const [quote, setQuote] = useState<Tick | null>(null);
  const candlesRef = useRef(candles);
  const callbacks = useRef({ onClosed, onResync });
  useEffect(() => {
    candlesRef.current = candles;
    callbacks.current = { onClosed, onResync };
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new dataset starts without a forming candle
    setLiveCandle(null);
    const historyAt = Math.floor(Date.now() / 1000);
    if (!enabled || interval === "1wk" || interval === "1mo") return;
    let stopped = false;
    let forming: Candle | null = null;
    let lastTick = 0;
    let first = true;
    const poll = async () => {
      if (stopped || document.hidden || !inMarketWindow(new Date())) return;
      try {
        const res = await fetch(`/api/instruments/${encodeURIComponent(symbol)}/live?after=${lastTick}`, { cache: "no-store" });
        if (!res.ok) return;
        const data: { live: boolean; ticks: Tick[] } = await res.json();
        if (stopped || !data.live || data.ticks.length === 0) return;
        const ticks = data.ticks;
        lastTick = ticks[ticks.length - 1].time;
        setQuote(ticks[ticks.length - 1]);
        const hist = candlesRef.current;
        const last = hist[hist.length - 1] ?? null;
        if (first) {
          first = false;
          const current = bucketStart(lastTick, interval);
          if (current === null) return;
          // Rebuild the current candle from trades when they cover all of it; otherwise extend the
          // history's last candle with trades newer than the history itself (so volume isn't counted twice).
          if (ticks[0].time <= current) {
            forming = applyTicks(null, ticks.filter((t) => t.time >= current), interval).forming;
          } else {
            const base = last && last.time === current ? last : null;
            forming = applyTicks(base, ticks.filter((t) => t.time > historyAt && t.time >= current), interval).forming;
          }
        } else {
          const r = applyTicks(forming, ticks, interval);
          forming = r.forming;
          if (r.closed.length) callbacks.current.onClosed?.(r.closed);
        }
        if (forming && last && forming.time < last.time) return;
        setLiveCandle(forming ? { ...forming } : null);
      } catch {
        // A missed poll is harmless — the next one catches up.
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    const resync = setInterval(() => !document.hidden && inMarketWindow(new Date()) && callbacks.current.onResync?.(), 5 * 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(resync);
    };
  }, [enabled, symbol, interval, resetKey]);

  return { liveCandle, quote };
}
