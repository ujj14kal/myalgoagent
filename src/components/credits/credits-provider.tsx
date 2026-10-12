"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { CreditSnapshot } from "@/lib/credits/types";

// The live credit balance for the whole app. It changes the moment anything is spent — the server hands the fresh balance
// back with each result — and it also re-reads on its own: when the tab is shown, every few seconds while it is open, when the
// page changes, and when another tab spends. So nobody has to refresh to see where they stand.

type Ctx = {
  snap: CreditSnapshot;
  /** Show a balance that has just come back from the server (ignored if an older reading than the one shown). */
  apply: (s: CreditSnapshot | null | undefined) => void;
  /** Read the balance again now. */
  refresh: () => void;
};

const CreditsContext = createContext<Ctx | null>(null);
const CHANNEL = "maa-credits";
const EVENT = "maa:credits";

export function useCredits(): Ctx {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}

/** Tells the meter that something that costs credits just finished (for results that don't carry the new balance). */
export function creditsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export default function CreditsProvider({ initial, children }: { initial: CreditSnapshot; children: React.ReactNode }) {
  const [snap, setSnap] = useState(initial);
  const channel = useRef<BroadcastChannel | null>(null);
  const busy = useRef(false);
  const pathname = usePathname();

  const apply = useCallback((s: CreditSnapshot | null | undefined) => {
    if (!s) return;
    setSnap((cur) => (cur.at > s.at ? cur : s));
    try {
      channel.current?.postMessage(s);
    } catch {
      /* another tab just won't hear about it until its next read */
    }
  }, []);

  const refresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CreditSnapshot>) : null))
      .then((s) => apply(s))
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [apply]);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      channel.current = bc;
      bc.onmessage = (e: MessageEvent<CreditSnapshot>) => setSnap((cur) => (cur.at > e.data.at ? cur : e.data));
    } catch {
      /* older browsers: polling still keeps it right */
    }
    let delay: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (delay) clearTimeout(delay);
      delay = setTimeout(refresh, 300);
    };
    const tick = () => document.visibilityState === "visible" && refresh();
    const timer = window.setInterval(tick, 12_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(EVENT, soon);
    return () => {
      window.clearInterval(timer);
      if (delay) clearTimeout(delay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(EVENT, soon);
      bc?.close();
      channel.current = null;
    };
  }, [refresh]);

  // Moving to another page (for example after a backtest finishes) re-reads at once.
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [pathname, refresh]);

  return <CreditsContext.Provider value={{ snap, apply, refresh }}>{children}</CreditsContext.Provider>;
}
