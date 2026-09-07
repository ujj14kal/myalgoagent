"use client";

import { useState, useTransition, type ReactNode } from "react";

/**
 * Wraps the Google/GitHub sign-in forms and disables BOTH the instant either
 * is submitted. Auth.js stores the in-flight OAuth attempt's PKCE verifier
 * in one cookie keyed by provider — starting a second flow (a stray double
 * click, or clicking the other provider before the first redirect lands)
 * overwrites that cookie, so the first flow's callback later fails with
 * "pkceCodeVerifier value could not be parsed" when Google/GitHub redirects
 * back. Locking both buttons on first submit makes that race impossible.
 */
export default function OAuthButtons({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div
      className="w-full"
      onSubmitCapture={() => {
        setLocked(true);
        startTransition(() => {});
      }}
      inert={locked || undefined}
      aria-busy={locked}
    >
      {children}
    </div>
  );
}
