"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/report-client-error";

// Scoped to the authenticated app shell: Next.js keeps the parent layout
// (sidebar + topbar) mounted and only replaces the page below it, so a crash
// on one page never takes the whole navigation down with it.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("app/app/error", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-black/5 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-brand-navy">This page hit a problem</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        The error has been logged. Your data is safe — nothing was changed by this failure.
      </p>
      {error.digest && <p className="mt-2 text-xs text-brand-navy/40">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light"
        >
          Try again
        </button>
        <Link
          href="/app/dashboard"
          className="rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
