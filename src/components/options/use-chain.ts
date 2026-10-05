"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { marketOpen } from "@/lib/options/chain";
import type { ChainResponse } from "./chain-types";

/** Where the chain is loaded from (the dev preview page points it elsewhere). */
export const ChainEndpoint = createContext("/api/options/chain");

export type ChainParams = { underlying: string; expiry: string | null; window?: number; page?: number; size?: number; strike?: number };

/** Loads /api/options/chain for these settings and refreshes it every 5 s while the market is open. */
export function useChain(p: ChainParams, enabled = true) {
  const [data, setData] = useState<ChainResponse | null>(null);
  const [error, setError] = useState<{ message: string; issues: ChainResponse["brokerIssues"] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const endpoint = useContext(ChainEndpoint);
  const key = JSON.stringify(p);

  useEffect(() => {
    if (!enabled || !p.underlying) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    const q = new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v === null || v === undefined ? [] : [[k, String(v)]])));
    fetch(`${endpoint}?${q}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as ChainResponse }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || body.error) return setError({ message: body.error ?? "Couldn't load the option chain.", issues: body.brokerIssues ?? [] });
        setError(null);
        setData(body);
      })
      .catch(() => !cancelled && setError({ message: "Couldn't load the option chain.", issues: [] }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for every field of p
  }, [key, tick, enabled, endpoint]);

  useEffect(() => {
    const t = setInterval(() => !document.hidden && marketOpen(Date.now()) && setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return { data, error, loading, refresh: () => setTick((n) => n + 1) };
}
