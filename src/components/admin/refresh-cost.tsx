"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshCost } from "@/lib/admin/actions";

/** Cost Explorer charges $0.01 per lookup, so cost is cached for a day unless refreshed here. */
export default function RefreshCost() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title="Fetches fresh numbers from AWS (costs $0.02)"
      onClick={() =>
        start(async () => {
          await refreshCost();
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary disabled:opacity-40"
    >
      <RefreshCw size={12} className={pending ? "animate-spin" : ""} /> Refresh
    </button>
  );
}
