"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Unplug } from "lucide-react";
import { disconnectUserBroker } from "@/lib/admin/actions";

export default function BrokerDisconnect({ userId, broker, name }: { userId: string; broker: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title="For a security incident: deletes their saved keys and session"
      onClick={() => {
        if (!window.confirm(`Disconnect ${name} for this user? Their saved API keys are deleted and they'll need to set it up again.`)) return;
        start(async () => {
          const r = await disconnectUserBroker(userId, broker);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-brand-sell ring-1 ring-brand-sell/25 hover:bg-brand-sell/5 disabled:opacity-40"
    >
      <Unplug size={11} /> {pending ? "…" : "Disconnect"}
    </button>
  );
}
