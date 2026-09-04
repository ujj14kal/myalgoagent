"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkUsernameAction, completeUsernameAction } from "@/lib/account-actions";

export default function ChooseUsernameForm({ seedSuggestions }: { seedSuggestions: string[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [suggestions, setSuggestions] = useState<string[]>(seedSuggestions);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3) return;
    const handle = setTimeout(async () => {
      setStatus("checking");
      const result = await checkUsernameAction(trimmed);
      setStatus(result.available ? "available" : "taken");
      if (!result.available) setSuggestions(result.suggestions);
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  const displayedStatus = username.trim().length < 3 ? "idle" : status;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (displayedStatus !== "available") {
      setError("Choose an available username first.");
      return;
    }
    setSubmitting(true);
    const result = await completeUsernameAction(username);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/app/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Username</label>
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {displayedStatus === "checking" && <p className="mt-1 text-xs text-brand-navy/40">Checking availability…</p>}
        {displayedStatus === "available" && <p className="mt-1 text-xs text-brand-buy">@{username} is available</p>}
        {displayedStatus === "taken" && suggestions.length > 0 && (
          <p className="mt-1 text-xs text-brand-navy/60">
            Taken — try:{" "}
            {suggestions.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setUsername(s)}
                className="font-semibold text-brand-primary underline underline-offset-2"
              >
                {s}
                {i < suggestions.length - 1 ? ", " : ""}
              </button>
            ))}
          </p>
        )}
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
