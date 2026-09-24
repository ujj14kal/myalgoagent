"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import Agent2D from "@/components/robot/agent-2d";
import { reportClientError } from "@/lib/report-client-error";

// Scoped to the authenticated app shell: Next.js keeps the parent layout
// (sidebar + topbar) mounted and only replaces the page below it, so a crash
// on one page never takes the whole navigation down with it.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError("app/app/error", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="surface mx-auto mt-6 flex max-w-lg flex-col items-center px-6 py-10 text-center">
      <Agent2D pose="alert" size={120} />
      <h1 className="mt-2 text-lg font-semibold text-brand-navy">This page hit a problem</h1>
      <p className="mt-1 text-sm text-brand-navy/60">
        It&rsquo;s been logged. Your data is safe — nothing was changed by this failure.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-brand-navy/40">Reference {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-light"
        >
          <RotateCcw size={15} /> Try again
        </button>
        <Link href="/app/dashboard" className="rounded-full border border-brand-navy/15 px-5 py-2.5 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
