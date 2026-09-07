"use client";

import { useState } from "react";
import { unlinkAccountAction, connectProviderAction } from "@/lib/account-links";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

export default function ConnectedAccounts({
  providers,
  linked,
}: {
  providers: string[];
  linked: string[];
}) {
  const [state, setState] = useState<Record<string, string | null>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function handleUnlink(provider: string) {
    setPending(provider);
    setState((s) => ({ ...s, [provider]: null }));
    const result = await unlinkAccountAction(provider);
    setPending(null);
    if (!result.ok) setState((s) => ({ ...s, [provider]: result.error }));
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const isLinked = linked.includes(provider);
        return (
          <div key={provider} className="flex items-center justify-between rounded-xl border border-black/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-brand-navy">{PROVIDER_LABEL[provider] ?? provider}</p>
              <p className="text-xs text-brand-navy/50">{isLinked ? "Connected" : "Not connected"}</p>
              {state[provider] && <p className="mt-1 text-xs text-brand-sell">{state[provider]}</p>}
            </div>
            {isLinked ? (
              <button
                type="button"
                disabled={pending === provider}
                onClick={() => handleUnlink(provider)}
                className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-sell hover:text-brand-sell disabled:opacity-50"
              >
                {pending === provider ? "Unlinking…" : "Unlink"}
              </button>
            ) : (
              <form action={connectProviderAction.bind(null, provider)}>
                <button
                  type="submit"
                  className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light"
                >
                  Connect
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
