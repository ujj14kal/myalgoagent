"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { inMarketWindow } from "@/lib/paper/market-window";

/** Re-renders the page's server data every `seconds` while the market is open and the tab is visible — and at once when the tab comes back into view. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (!document.hidden && inMarketWindow(new Date())) router.refresh();
    };
    const t = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
