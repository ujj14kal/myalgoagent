"use client";

import Link from "next/link";
import { ACTION_COST, ACTION_LABEL, PLANS, PLAN_ORDER, type CreditAction } from "@/lib/credits/config";
import type { CreditEventRow } from "@/lib/credits/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Coins, CreditCard, History, ListChecks, Receipt, Sparkles } from "lucide-react";
import { useCredits } from "./credits-provider";
import { CancelPlanButton } from "@/components/billing/razorpay-buttons";
import PaymentsTable from "@/components/billing/payments-table";
import Pager from "@/components/ui/pager";
import type { PageWindow } from "@/lib/pagination";

const fmt = (n: number) => n.toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const kindLabel = (e: CreditEventRow) => (e.kind === "SPEND" ? (ACTION_LABEL[e.action as CreditAction] ?? "Used") : e.kind === "RESET" ? "Monthly credits renewed" : e.kind === "PLAN" ? "Plan changed" : e.kind === "TOPUP_REFUND" ? "Top-up refunded" : e.kind === "TOPUP" ? "Top-up" : "Credits added");

export type BillingView = {
  /** Online payment is switched on (keys and plans are set up). */
  enabled: boolean;
  /** Razorpay is in test mode: no real money moves. */
  testMode: boolean;
  subscription: { plan: string; endsOn: string | null; cancelAtPeriodEnd: boolean } | null;
  payments: { id: string; when: string; what: string; amount: number; status: string; invoice: string | null }[];
};

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** Where the credits stand (live), what everything costs, the plans, recent payments, and the paged history. */
export default function UsagePanel({ events, historyWindow, billing }: { events: CreditEventRow[]; historyWindow: PageWindow; billing: BillingView }) {
  const { snap } = useCredits();
  const share = snap.monthlyOf > 0 ? Math.round((snap.monthly / snap.monthlyOf) * 100) : 0;
  const rows: [string, number][] = [
    ["An AI answer", ACTION_COST.ai_reply],
    ["An AI turn that prepares something (strategy, block, indicator, concept)", ACTION_COST.ai_build],
    ["One spoken exchange (listen, answer, speak)", ACTION_COST.ai_voice],
    ["Reading a typed reply aloud", ACTION_COST.ai_speak],
    ["The code editor's AI rule writer", ACTION_COST.rule_code],
    ["A backtest: daily candles, up to a year", 1],
    ["A backtest: intraday, or 5 years or more of daily", 2],
    ["A backtest: intraday over a year or more", 3],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <CardHeader title={`${snap.planLabel} plan`} subtitle={`Monthly credits renew on ${new Date(snap.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}`} icon={Coins} />
          <p className="num mt-4 break-words text-4xl font-bold tabular-nums text-brand-navy">
            {fmt(snap.total)} <span className="text-base font-medium text-brand-navy/50">credits left</span>
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-brand-navy/75">Monthly plan credits</span>
                <span className="num tabular-nums text-brand-navy/60">{fmt(snap.monthly)} of {fmt(snap.monthlyOf)}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.08]">
                <div className="h-full rounded-full bg-brand-primary transition-all duration-700" style={{ width: `${share}%` }} />
              </div>
            </div>
            {snap.topup > 0 && (
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-brand-navy/75">Top-up credits</span>
                  <span className="num tabular-nums text-brand-navy/60">{fmt(snap.topup)}</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.08]">
                  <div className="h-full w-full rounded-full bg-brand-gold transition-all duration-700" />
                </div>
                <p className="mt-1 text-xs text-brand-navy/50">Used after your monthly credits run out. Kept for a year.</p>
              </div>
            )}
          </div>
          {snap.trial && (
            <div className="mt-3 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-3 text-sm text-brand-navy">
              <p className="flex items-center gap-2 font-semibold"><Sparkles size={15} className="shrink-0 text-brand-gold" /> Free trial — {daysLeft(snap.trial.endsAt)} day{daysLeft(snap.trial.endsAt) === 1 ? "" : "s"} left</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-navy/70">
                You&apos;re trying the paid features: {fmt(snap.monthlyOf)} credits, voice, intraday backtests and up to 5 forward tests. Going live needs a paid plan. When the trial ends your account moves to Free, and you can upgrade at any time.
              </p>
            </div>
          )}
          {snap.aiRepliesLeft !== null && (
            <p className="mt-3 rounded-lg bg-brand-primary/[0.06] px-3 py-2 text-sm text-brand-navy/75">
              The Free plan includes <strong>2 AI replies, once</strong> — <strong>{snap.aiRepliesLeft}</strong> left. Backtests on daily candles use the monthly credits.
            </p>
          )}
          {(snap.plan !== "FREE" || snap.trial) && (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["AI replies today", snap.today.ai],
                ["Builds today", snap.today.builds],
                ["Voice today", snap.today.voice],
              ].map(([label, v]) => {
                const x = v as { used: number; cap: number };
                return (
                  <div key={label as string} className="min-w-0 rounded-xl bg-brand-bg p-3">
                    <dt className="text-xs text-brand-navy/50">{label as string}</dt>
                    <dd className="num mt-0.5 font-semibold tabular-nums text-brand-navy">{x.used} <span className="font-normal text-brand-navy/45">of {x.cap}</span></dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <CardHeader title="Plan & billing" subtitle="Prices are before 18% GST" icon={CreditCard} />
          <div className="mt-4 space-y-3 text-sm">
            {billing.subscription ? (
              <div className="rounded-xl bg-brand-bg p-3">
                <p className="font-semibold text-brand-navy">{PLANS[billing.subscription.plan as keyof typeof PLANS]?.label ?? billing.subscription.plan} plan</p>
                <p className="mt-0.5 text-xs text-brand-navy/60">{billing.subscription.cancelAtPeriodEnd ? `Won't renew — ends ${billing.subscription.endsOn ?? "at the end of this period"}.` : `Renews monthly${billing.subscription.endsOn ? `, next on ${billing.subscription.endsOn}` : ""}.`}</p>
                {!billing.subscription.cancelAtPeriodEnd && <div className="mt-2"><CancelPlanButton endsOn={billing.subscription.endsOn} /></div>}
              </div>
            ) : (
              <p className="text-brand-navy/60">You&apos;re on the {snap.planLabel} plan{snap.plan === "FREE" ? ". Upgrade for more credits, voice, intraday backtests and live trading." : "."}</p>
            )}
            <Link href="/app/checkout" className="block rounded-full bg-brand-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-primary-light">
              {snap.plan === "FREE" ? "Choose a plan" : "Change plan or top up"}
            </Link>
            <Link href="/app/account/payments" className="block text-center text-xs font-semibold text-brand-primary hover:underline">Payments &amp; invoices</Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-5">
          <CardHeader title="What things cost" subtitle="Live trading, risk controls, charts, demos and forward tests never use credits" icon={ListChecks} />
          <ul className="mt-3 divide-y divide-brand-navy/[0.06] text-sm">
            {rows.map(([what, c]) => (
              <li key={what} className="flex items-start justify-between gap-4 py-2.5">
                <span className="min-w-0 break-words text-brand-navy/80">{what}</span>
                <span className="num shrink-0 whitespace-nowrap font-semibold tabular-nums text-brand-navy">{c} credit{c === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0 p-5">
          <CardHeader title="Plans" subtitle="Pick one at checkout, where you'll see the bill split before you pay" icon={CreditCard} />
          {billing.enabled && billing.testMode && <p className="mt-3 rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-brand-navy/75">Payments are in test mode: no real money moves.</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const spec = PLANS[p];
              const current = snap.plan === p && !(p === "FREE" && snap.trial);
              return (
                <div key={p} className={`flex min-w-0 flex-col rounded-xl border p-3 text-sm ${current ? "border-brand-primary bg-brand-primary/[0.05]" : "border-brand-navy/10"}`}>
                  <p className="flex flex-wrap items-center gap-1.5 font-bold text-brand-navy">{spec.label}{current ? <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">current</span> : null}</p>
                  <p className="num text-lg font-bold tabular-nums">{spec.price ? `₹${fmt(spec.price)}` : "₹0"}<span className="text-xs font-normal text-brand-navy/50">{spec.price ? "/month + GST" : ""}</span></p>
                  <p className="mt-1 flex-1 break-words text-xs text-brand-navy/60">{p === "FREE" ? `${spec.monthlyCredits} daily backtests a month, and 2 AI replies in all; no forward tests or live` : `${fmt(spec.monthlyCredits)} credits a month, voice, ${spec.slots.live} live strategies, ${spec.slots.forward} forward tests`}</p>
                  {p !== "FREE" && !current && !(p === "TRADE" && snap.plan === "PRO") && (
                    <Link href={`/app/checkout?item=plan:${p}`} className="mt-3 rounded-full border border-brand-primary/30 px-3 py-1.5 text-center text-xs font-semibold text-brand-primary hover:bg-brand-primary/5">{snap.trial ? "Upgrade" : "Choose"} {spec.label}</Link>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-brand-navy/55">
            Need credits? <Link href="/app/checkout" className="font-semibold text-brand-primary hover:underline">Top up</Link> from 400 credits (Trade and Pro). Need a hand with a plan or a payment?{" "}
            <Link href="/app/support" className="font-semibold text-brand-primary hover:underline">Contact support</Link>.
          </p>
        </Card>
      </div>

      {billing.payments.length > 0 && (
        <Card className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardHeader title="Recent payments" subtitle="Your latest payments through Razorpay, with GST" icon={Receipt} />
            <Link href="/app/account/payments" className="text-xs font-semibold text-brand-primary hover:underline">All payments &amp; invoices →</Link>
          </div>
          <PaymentsTable rows={billing.payments} />
        </Card>
      )}

      <Card className="min-w-0 p-5">
        <CardHeader title="History" subtitle="Every change to your credits, newest first" icon={History} />
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-brand-navy/50">Nothing yet.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr>
                    <th>When (IST)</th>
                    <th>What</th>
                    <th className="num-cell">Credits</th>
                    <th className="num-cell">Left after</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-brand-navy/60">{when(e.createdAt)}</td>
                      <td className="break-words">{kindLabel(e)}</td>
                      <td className={`num-cell whitespace-nowrap font-semibold tabular-nums ${e.credits < 0 ? "text-brand-navy" : e.credits > 0 ? "text-[#0b6b30]" : "text-brand-navy/45"}`}>{e.credits === 0 ? "free" : `${e.credits > 0 ? "+" : "−"}${Math.abs(e.credits)}`}</td>
                      <td className="num-cell whitespace-nowrap tabular-nums text-brand-navy/60">{fmt(e.monthlyAfter + e.topupAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager basePath="/app/account/usage" window={historyWindow} pageKey="hp" sizeKey="hs" />
          </>
        )}
      </Card>
    </div>
  );
}
