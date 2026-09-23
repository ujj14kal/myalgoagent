"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

// Replaces the root layout when it itself crashes, so it can't rely on any
// app chrome, Tailwind theme classes, or fonts — plain inline styles only.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("app/global-error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f7f7fb",
          color: "#1a1f36",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            MyAlgoAgent hit an unexpected problem. It&rsquo;s been logged — please try again.
          </p>
          {error.digest && <p style={{ marginTop: 8, fontSize: 12, opacity: 0.4 }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 24,
              padding: "12px 24px",
              borderRadius: 999,
              border: "none",
              background: "#4c1d95",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
