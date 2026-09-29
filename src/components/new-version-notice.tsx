"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isStaleVersionError, STALE_EVENT } from "@/lib/friendly-error";

/**
 * Shown when this tab was opened before the latest update and an action can't
 * reach the server any more — one clear sentence and a Reload button.
 */
export default function NewVersionNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    const onRejection = (e: PromiseRejectionEvent) => isStaleVersionError(e.reason) && setShow(true);
    const onError = (e: ErrorEvent) => isStaleVersionError(e.error ?? e.message) && setShow(true);
    window.addEventListener(STALE_EVENT, on);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener(STALE_EVENT, on);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  if (!show) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-4 z-[100] mx-auto flex w-[min(92vw,34rem)] items-center gap-3 rounded-2xl bg-brand-navy px-4 py-3 text-sm text-white shadow-xl">
      <span className="flex-1">MyAlgoAgent was just updated. Reload the page to continue — your unsaved strategy is kept.</span>
      <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy">
        <RefreshCw size={12} /> Reload
      </button>
    </div>
  );
}
