"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { cancelMyLiveOrder, refreshMyLiveOrders } from "@/lib/live-actions";

export function RefreshOrders() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-brand-navy/50">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshMyLiveOrders();
            setMsg(r.ok ? (r.message ?? null) : r.error);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary disabled:opacity-40"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} /> Refresh from Groww
      </button>
    </span>
  );
}

export function CancelOrder({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this order on Groww?")) return;
        start(async () => {
          const r = await cancelMyLiveOrder(id);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-brand-sell ring-1 ring-brand-sell/25 hover:bg-brand-sell/5 disabled:opacity-40"
    >
      <X size={11} /> {pending ? "…" : "Cancel"}
    </button>
  );
}
