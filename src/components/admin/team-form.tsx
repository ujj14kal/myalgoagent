"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { setStaffRole } from "@/lib/admin/actions";

type Role = "OWNER" | "ADMIN" | "SUPPORT";

export function AddMember() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SUPPORT");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their MyAlgoAgent account email" className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary/40" />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm">
          <option value="SUPPORT">Support</option>
          <option value="ADMIN">Admin</option>
          <option value="OWNER">Owner</option>
        </select>
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={() =>
            start(async () => {
              const r = await setStaffRole(email, role);
              setFlash(r.ok ? { ok: true, text: r.message ?? "Added." } : { ok: false, text: r.error });
              if (r.ok) {
                setEmail("");
                router.refresh();
              }
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <UserPlus size={15} /> Add
        </button>
      </div>
      {flash && <p className={`text-xs font-medium ${flash.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{flash.text}</p>}
    </div>
  );
}

export function MemberRole({ email, role, locked }: { email: string; role: Role; locked: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (locked) return <span className="text-xs font-semibold text-brand-navy/50">{role === "OWNER" ? "Owner" : role}</span>;
  return (
    <span className="flex items-center gap-2">
      <select
        value={role}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await setStaffRole(email, e.target.value as Role);
            if (!r.ok) window.alert(r.error);
            router.refresh();
          })
        }
        className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs"
      >
        <option value="SUPPORT">Support</option>
        <option value="ADMIN">Admin</option>
        <option value="OWNER">Owner</option>
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${email} from the team?`)) return;
          start(async () => {
            const r = await setStaffRole(email, null);
            if (!r.ok) window.alert(r.error);
            router.refresh();
          });
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-sell hover:bg-brand-sell/5"
      >
        Remove
      </button>
    </span>
  );
}
