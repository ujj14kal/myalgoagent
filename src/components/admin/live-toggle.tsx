"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { setLiveTrading } from "@/lib/admin/actions";

export default function LiveToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(enabled ? "Turn off live trading for this account? New real orders will be refused." : "Allow this account to place REAL orders through its connected broker?")) return;
        start(async () => {
          const r = await setLiveTrading(userId, !enabled);
          window.alert(r.ok ? (r.message ?? "Done.") : r.error);
          router.refresh();
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 disabled:opacity-40 ${enabled ? "bg-brand-buy/10 text-[#0b6b30] ring-brand-buy/30" : "bg-white text-brand-navy/70 ring-black/10"}`}
    >
      <Radio size={13} /> {pending ? "…" : enabled ? "Live trading: on" : "Live trading: off"}
    </button>
  );
}
