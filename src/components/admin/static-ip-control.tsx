"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { setStaticIp } from "@/lib/admin/actions";

/** Assign the static IP this account registers at its broker (one client per IP). */
/** `relay` is the state of the account's own automatic static IP (paid plans): null = none, ACTIVE, PENDING (being created), RELEASING (cancelled, kept for the grace period), FAILED. */
export default function StaticIpControl({ userId, ip, relay = null }: { userId: string; ip: string | null; relay?: string | null }) {
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
      <Globe size={13} /> {pending ? "…" : ip ? `Static IP: ${ip}${relay === "ACTIVE" ? " · own relay active" : relay === "RELEASING" ? " · kept after cancel" : relay === "PENDING" ? " · being set up" : relay === "FAILED" ? " · setup failed" : ""}` : relay === "PENDING" ? "Static IP being created…" : relay === "FAILED" ? "Static IP setup failed" : "No static IP assigned yet"}
    </button>
  );
}
