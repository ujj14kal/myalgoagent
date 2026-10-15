"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";

export type DeployChoice = { id: string; name: string; symbol: string };

/** Picks one of the user's strategies and opens its Go live dialog (the same one the strategy cards use). */
export default function DeployPicker({ choices }: { choices: DeployChoice[] }) {
  const router = useRouter();
  const [id, setId] = useState("");
  if (choices.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="deploy-strategy">
        Strategy to deploy
      </label>
      <select
        id="deploy-strategy"
        value={id}
        onChange={(e) => setId(e.target.value)}
        className="max-w-[16rem] rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-brand-navy"
      >
        <option value="">Choose a strategy…</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.symbol.replace(/\.NS$/, "")}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!id}
        onClick={() => router.push(`/app/strategies/${id}?deploy=1`)}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        <Rocket size={13} /> Deploy
      </button>
    </div>
  );
}
