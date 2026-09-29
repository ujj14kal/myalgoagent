"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/report-client-error";
import { isStaleVersionError } from "@/lib/friendly-error";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const stale = isStaleVersionError(error);
  useEffect(() => {
    reportClientError("app/error", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-brand-navy">{stale ? "MyAlgoAgent was just updated" : "Something went wrong"}</h1>
      <p className="mt-3 text-brand-navy/70">
        {stale ? "Reload the page to get the latest version — nothing was lost." : "We hit an unexpected problem loading this page. It\u2019s been logged — please try again."}
      </p>
      {!stale && error.digest && <p className="mt-2 text-xs text-brand-navy/40">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : retry())}
          className="rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light"
        >
          {stale ? "Reload" : "Try again"}
        </button>
        <Link
          href="/"
          className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
