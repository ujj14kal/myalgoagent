"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { inMarketWindow } from "@/lib/paper/market-window";

/** Re-renders the page's server data every `seconds` while the market is open and the tab is visible. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden && inMarketWindow(new Date())) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
