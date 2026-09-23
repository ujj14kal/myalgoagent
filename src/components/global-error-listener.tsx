"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** Catches what React error boundaries can't: throws inside event handlers
 * and unhandled promise rejections. Renders nothing. */
export default function GlobalErrorListener() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError("window.onerror", event.error ?? event.message);
    }
    function onRejection(event: PromiseRejectionEvent) {
      reportClientError("unhandledrejection", event.reason);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
