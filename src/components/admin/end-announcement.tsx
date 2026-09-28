"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { endAnnouncement } from "@/lib/admin/actions";

export default function EndAnnouncement({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await endAnnouncement(id);
          router.refresh();
        })
      }
      className="rounded-full px-3 py-1 text-xs font-semibold text-brand-sell ring-1 ring-brand-sell/25 hover:bg-brand-sell/5 disabled:opacity-40"
    >
      {pending ? "…" : "Take down"}
    </button>
  );
}
