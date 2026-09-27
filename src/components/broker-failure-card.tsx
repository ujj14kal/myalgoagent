"use client";

import Link from "next/link";
import { KeyRound, LogIn, MessageCircle, RefreshCw } from "lucide-react";
import { describeFailure, type Failure } from "@/lib/brokers/failures";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";

/**
 * A failed broker connection in plain English: what happened, why, the exact
 * steps to fix it, and the one button that retries it the right way.
 */
export default function BrokerFailureCard({
  brokerId,
  brokerName,
  failure,
  onRetry,
  onReplaceKeys,
  retrying = false,
  compact = false,
}: {
  brokerId: string;
  brokerName: string;
  failure: Failure;
  onRetry?: () => void;
  onReplaceKeys?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  const { agentName, openChat } = useAgentChat();
  const t = describeFailure(failure, brokerName);
  const detail = failure.detail?.trim();
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50";
  const primary = `${btn} bg-brand-primary text-white hover:bg-brand-primary-light`;
  const secondary = `${btn} text-brand-navy ring-1 ring-brand-navy/15 hover:bg-brand-navy/5`;
  const replaceKeys = (cls: string) =>
    onReplaceKeys ? (
      <button type="button" onClick={onReplaceKeys} className={cls}>
        <KeyRound size={15} /> Replace keys
      </button>
    ) : (
      <Link href={`/app/broker-connections?broker=${brokerId}&edit=1`} className={cls}>
        <KeyRound size={15} /> Replace keys
      </Link>
    );

  return (
    <div role="alert" className={`rounded-2xl border border-brand-sell/20 bg-brand-sell/[0.035] ${compact ? "p-4" : "p-5"}`}>
      <p className={`font-semibold text-brand-navy ${compact ? "text-sm" : "text-base"}`}>{t.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-navy/70">{t.reason}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-navy/45">How to fix it</p>
      <ol className="mt-2 space-y-1.5">
        {t.steps.map((s, i) => (
          <li key={s} className="flex gap-2.5 text-sm text-brand-navy/80">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand-sell ring-1 ring-brand-sell/25">{i + 1}</span>
            <span className="pt-px">{s}</span>
          </li>
        ))}
      </ol>

      {detail && (
        <p className="mt-4 rounded-lg bg-white/80 px-3 py-2 text-xs text-brand-navy/60 ring-1 ring-black/[0.05]">
          <span className="font-semibold text-brand-navy/70">What {brokerName} said:</span> “{detail}”
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {t.retry === "keys" && replaceKeys(primary)}
        {t.retry === "signin" && (
          <Link href="/login?callbackUrl=%2Fapp%2Fbroker-connections" className={primary}>
            <LogIn size={15} /> Sign in
          </Link>
        )}
        {(t.retry === "login" || t.retry === "later") && onRetry && (
          <button type="button" onClick={onRetry} disabled={retrying} className={primary}>
            <RefreshCw size={15} className={retrying ? "animate-spin" : ""} /> {retrying ? `Opening ${brokerName}…` : "Try again"}
          </button>
        )}
        {t.retry === "login" && failure.code !== "session_ended" && !compact && replaceKeys(secondary)}
        <button
          type="button"
          onClick={() => openChat(`My ${brokerName} broker connection failed with "${t.title}"${detail ? ` (${brokerName} said: "${detail}")` : ""}. Help me fix it step by step.`)}
          className={`${btn} text-brand-primary hover:bg-brand-primary/5`}
        >
          <MessageCircle size={15} /> Ask {agentName}
        </button>
      </div>
    </div>
  );
}
