"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { setStaticIp } from "@/lib/admin/actions";

/** Assign the static IP this account registers at its broker (one client per IP). */
export default function StaticIpControl({ userId, ip }: { userId: string; ip: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = window.prompt("Static IP for this account (leave empty to clear). It must be registered on this user's broker account only.", ip ?? "");
        if (next === null || next.trim() === (ip ?? "")) return;
        start(async () => {
          const r = await setStaticIp(userId, next.trim() || null);
          window.alert(r.ok ? (r.message ?? "Done.") : r.error);
          router.refresh();
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 disabled:opacity-40 ${ip ? "bg-brand-primary/5 text-brand-primary ring-brand-primary/25" : "bg-white text-brand-navy/70 ring-black/10"}`}
    >
      <Globe size={13} /> {pending ? "…" : ip ? `Static IP: ${ip}` : "Static IP: none"}
    </button>
  );
}
