"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import InstrumentCombobox from "@/components/instrument-combobox";
import { createWorkspace } from "@/lib/workspace-actions";

export default function NewWorkspaceForm({ instruments, defaultInstrumentId }: { instruments: { id: string; symbol: string; name: string }[]; defaultInstrumentId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createWorkspace({ name, description, instrumentId });
      if ("error" in r) return setError(r.error === "DUPLICATE_NAME" ? `You already have a workspace called "${name.trim()}". Choose a different name.` : r.error);
      router.push(`/app/workspaces/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="surface mx-auto max-w-xl space-y-4 p-5">
      <div>
        <label htmlFor="nw-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Name</label>
        <input id="nw-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trend + dip entries" className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Instrument</label>
        <InstrumentCombobox options={instruments} value={instrumentId} onChange={setInstrumentId} />
      </div>
      <div>
        <label htmlFor="nw-desc" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Notes (optional)</label>
        <input id="nw-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary" />
      </div>
      {error && <p className="text-sm font-medium text-brand-sell">{error}</p>}
      <button type="submit" disabled={pending || !name.trim()} className="rounded-full bg-brand-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create the workspace"}
      </button>
    </form>
  );
}
