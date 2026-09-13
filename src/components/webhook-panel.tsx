"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookToken, setWebhookEnabled } from "@/lib/webhook-actions";

export interface WebhookAlertRow {
  id: string;
  receivedAt: string;
  rawPayload: string;
  parsedAction: "BUY" | "SELL" | null;
  parseError: string | null;
  executed: boolean;
}

export default function WebhookPanel({
  strategyId,
  initialEnabled,
  hasToken,
  alerts,
}: {
  strategyId: string;
  initialEnabled: boolean;
  hasToken: boolean;
  alerts: WebhookAlertRow[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateWebhookToken(strategyId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.token) {
        setRevealedUrl(`${window.location.origin}/api/webhooks/tradingview/${result.token}`);
        setEnabled(true);
      }
    });
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      await setWebhookEnabled(strategyId, next);
    });
  }

  function copy() {
    if (!revealedUrl) return;
    navigator.clipboard.writeText(revealedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-navy">Webhook setup</p>
        {hasToken && (
          <label className="flex items-center gap-2 text-xs font-medium text-brand-navy/60">
            <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={isPending} />
            {enabled ? "Enabled" : "Disabled"}
          </label>
        )}
      </div>

      {revealedUrl ? (
        <div className="mt-3 rounded-lg border border-brand-primary/30 bg-brand-primary/5 p-3">
          <p className="text-xs font-semibold text-brand-navy">
            Your webhook URL — copy it now, it won&apos;t be shown again:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-white px-2 py-1.5 text-xs text-brand-navy/80">
              {revealedUrl}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-brand-navy/60">
            {hasToken
              ? "A webhook URL is already configured. Regenerating replaces it — the old URL stops working immediately."
              : "Generate a URL, then paste it as a webhook in your TradingView alert."}
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className="mt-2 rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50"
          >
            {hasToken ? "Regenerate webhook URL" : "Generate webhook URL"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}

      <div className="mt-4 rounded-lg bg-brand-bg p-3">
        <p className="text-xs font-semibold text-brand-navy/70">Alert message examples for TradingView</p>
        <ul className="mt-1.5 space-y-1 text-xs text-brand-navy/50">
          <li>
            Plain text: <code className="rounded bg-white px-1.5 py-0.5">BUY</code> or{" "}
            <code className="rounded bg-white px-1.5 py-0.5">SELL</code>
          </li>
          <li>
            JSON: <code className="rounded bg-white px-1.5 py-0.5">{`{"action":"BUY"}`}</code>
          </li>
        </ul>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-brand-navy">Recent signals</p>
        {alerts.length === 0 ? (
          <p className="mt-1 text-xs text-brand-navy/40">No signals received yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-brand-navy/40">
                  <th className="pb-1.5 pr-3 font-medium">Received</th>
                  <th className="pb-1.5 pr-3 font-medium">Payload</th>
                  <th className="pb-1.5 pr-3 font-medium">Parsed</th>
                  <th className="pb-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-t border-black/5">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-brand-navy/60">
                      {new Date(a.receivedAt).toLocaleString()}
                    </td>
                    <td className="max-w-[220px] truncate py-1.5 pr-3 text-brand-navy/60" title={a.rawPayload}>
                      {a.rawPayload || "(empty)"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {a.parsedAction ? (
                        <span className={a.parsedAction === "BUY" ? "text-brand-buy" : "text-brand-sell"}>
                          {a.parsedAction}
                        </span>
                      ) : (
                        <span className="text-brand-navy/30">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-brand-navy/60">
                      {a.executed ? "Executed" : a.parseError ? a.parseError : "Not executed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
