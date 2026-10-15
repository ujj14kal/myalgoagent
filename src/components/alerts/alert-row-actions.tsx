"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPriceAlert, deletePriceAlert } from "@/lib/alerts/alert-actions";

/** Cancel an active alert, or remove a finished one from the list. */
export default function AlertRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => (await (active ? cancelPriceAlert(id) : deletePriceAlert(id)), router.refresh()))}
      className="rounded-full px-3 py-1 text-xs font-semibold text-brand-navy/55 ring-1 ring-brand-navy/15 hover:text-brand-sell disabled:opacity-50"
    >
      {active ? "Cancel" : "Remove"}
    </button>
  );
}
