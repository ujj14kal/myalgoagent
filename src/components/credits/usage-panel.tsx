"use client";

import Link from "next/link";
import { ACTION_COST, ACTION_LABEL, PLANS, PLAN_ORDER, TOPUP_PACKS, type CreditAction } from "@/lib/credits/config";
import type { CreditEventRow } from "@/lib/credits/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Coins, FlaskConical, History, ListChecks, Receipt, ShoppingBag, Sparkles } from "lucide-react";
import { useCredits } from "./credits-provider";
import { CancelPlanButton, TopupButton, UpgradeButton } from "@/components/billing/razorpay-buttons";

const fmt = (n: number) => n.toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const kindLabel = (e: CreditEventRow) => (e.kind === "SPEND" ? (ACTION_LABEL[e.action as CreditAction] ?? "Used") : e.kind === "RESET" ? "Monthly credits renewed" : e.kind === "PLAN" ? "Plan changed" : e.kind === "TOPUP" ? "Top-up" : "Credits added");

export type BillingView = {
  /** Online payment is switched on (keys and plans are set up). */
  enabled: boolean;
  /** Razorpay is in test mode: no real money moves. */
  testMode: boolean;
  subscription: { plan: string; endsOn: string | null; cancelAtPeriodEnd: boolean } | null;
  payments: { id: string; when: string; what: string; amount: number; status: string; invoice: string | null }[];
};

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** Where the credits stand (live), what everything costs, the plans (with payment), and the history. */
export default function UsagePanel({ events, billing }: { events: CreditEventRow[]; billing: BillingView }) {
  const { snap } = useCredits();
  const share = snap.monthlyOf > 0 ? Math.round((snap.monthly / snap.monthlyOf) * 100) : 0;
  const rows: [string, string][] = [
    ["An AI answer", `${ACTION_COST.ai_reply}`],
    ["An AI turn that prepares something (strategy, block, indicator, concept)", `${ACTION_COST.ai_build}`],
    ["One spoken exchange (listen, answer, speak)", `${ACTION_COST.ai_voice}`],
    ["Reading a typed reply aloud", `${ACTION_COST.ai_speak}`],
    ["The code editor's AI rule writer", `${ACTION_COST.rule_code}`],
    ["A backtest: daily candles, up to a year", "1"],
    ["A backtest: intraday, or 5 years or more of daily", "2"],
    ["A backtest: intraday over a year or more", "3"],
  ];
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <CardHeader title={`${snap.planLabel} plan`} subtitle={`Monthly credits renew on ${new Date(snap.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}`} icon={Coins} />
        <p className="num mt-4 text-4xl font-bold tabular-nums text-brand-navy">
          {fmt(snap.total)} <span className="text-base font-medium text-brand-navy/50">credits left</span>
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.08]">
          <div className="h-full rounded-full bg-brand-primary transition-all duration-700" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-2 text-sm text-brand-navy/60">
          {fmt(snap.monthly)} of {fmt(snap.monthlyOf)} monthly credits{snap.topup > 0 ? `, plus ${fmt(snap.topup)} top-up credits (kept for a year)` : ""}.
        </p>
        {snap.trial && (
          <div className="mt-3 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-3 text-sm text-brand-navy">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={15} className="text-brand-gold" /> Free trial — {daysLeft(snap.trial.endsAt)} day{daysLeft(snap.trial.endsAt) === 1 ? "" : "s"} left</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-navy/70">
              You&apos;re trying the paid features: {fmt(snap.monthlyOf)} credits, voice, intraday backtests and up to 5 forward tests. Going live needs a paid plan. When the trial ends your account moves to Free, and you can upgrade at any time, including right now.
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
                <div key={label as string} className="rounded-xl bg-brand-bg p-3">
                  <dt className="text-xs text-brand-navy/50">{label as string}</dt>
                  <dd className="num mt-0.5 font-semibold tabular-nums text-brand-navy">{x.used} <span className="font-normal text-brand-navy/45">of {x.cap}</span></dd>
                </div>
              );
            })}
          </dl>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="What things cost" subtitle="Live trading, risk controls, charts, demos and forward tests never use credits" icon={ListChecks} />
          <table className="data-table mt-3 text-sm">
            <tbody>
              {rows.map(([what, c]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td className="num-cell font-semibold">{c} credit{c === "1" ? "" : "s"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <CardHeader title="Plans and top-ups" subtitle="Prices include GST" icon={ShoppingBag} />
          {billing.enabled && billing.testMode && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-brand-navy/75">
              <FlaskConical size={14} className="mt-0.5 shrink-0 text-brand-gold" />
              <span>Test mode: no real money moves. Pay with test card <span className="num font-semibold">4111 1111 1111 1111</span>, any future expiry and any CVV, or UPI <span className="font-semibold">success@razorpay</span>.</span>
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const spec = PLANS[p];
              const current = snap.plan === p && !(p === "FREE" && snap.trial);
              return (
                <div key={p} className={`flex flex-col rounded-xl border p-3 text-sm ${current ? "border-brand-primary bg-brand-primary/[0.05]" : "border-brand-navy/10"}`}>
                  <p className="font-bold text-brand-navy">{spec.label}{current ? <span className="ml-1.5 rounded-full bg-brand-primary px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">current</span> : null}</p>
                  <p className="num text-lg font-bold tabular-nums">{spec.price ? `₹${fmt(spec.price)}` : "₹0"}<span className="text-xs font-normal text-brand-navy/50">{spec.price ? "/month" : ""}</span></p>
                  <p className="mt-1 flex-1 text-xs text-brand-navy/60">{p === "FREE" ? `${spec.monthlyCredits} credits a month for daily backtests, and 2 AI replies in all` : `${fmt(spec.monthlyCredits)} credits a month, voice, ${spec.slots.live} live strategies, ${spec.slots.forward} forward tests`}</p>
                  {billing.enabled && p !== "FREE" && snap.plan !== p && !(p === "TRADE" && snap.plan === "PRO") && (
                    <div className="mt-3"><UpgradeButton plan={p} label={snap.trial ? `Upgrade to ${spec.label} now` : `Choose ${spec.label}`} primary={p === "PRO" ? false : true} /></div>
                  )}
                  {current && p !== "FREE" && billing.subscription && (
                    <div className="mt-3 space-y-1 text-xs text-brand-navy/60">
                      <p>{billing.subscription.cancelAtPeriodEnd ? `Won't renew — ends ${billing.subscription.endsOn ?? "at the end of this period"}.` : `Renews monthly${billing.subscription.endsOn ? `, next on ${billing.subscription.endsOn}` : ""}.`}</p>
                      {!billing.subscription.cancelAtPeriodEnd && <CancelPlanButton endsOn={billing.subscription.endsOn} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-navy/45">Top-ups (Trade and Pro)</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {TOPUP_PACKS.map((t) => (
              <li key={t.credits}>
                {billing.enabled && snap.plan !== "FREE" ? (
                  <TopupButton credits={t.credits} price={t.price} />
                ) : (
                  <div className="rounded-lg bg-brand-bg px-3 py-2">
                    <span className="num font-semibold tabular-nums">{fmt(t.credits)}</span> credits · <span className="num tabular-nums">₹{fmt(t.price)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brand-navy/55">
            {billing.enabled ? "Payments are handled by Razorpay; your card details never reach MyAlgoAgent. Need a hand with a plan or a payment? " : "Online payment isn't switched on yet. To change plan or add credits now, "}
            <Link href="/app/support" className="font-semibold text-brand-primary hover:underline">
              {billing.enabled ? "Contact support" : "contact support"}
            </Link>
            .
          </p>
        </Card>
      </div>

      {billing.payments.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Payments" subtitle="What you've paid through Razorpay, GST included" icon={Receipt} />
          <div className="mt-3 overflow-x-auto">
            <table className="data-table text-sm">
              <thead><tr><th>When (IST)</th><th>For</th><th className="num-cell">Amount</th><th>Status</th><th>Invoice</th></tr></thead>
              <tbody>
                {billing.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{p.when}</td>
                    <td>{p.what}</td>
                    <td className="num-cell tabular-nums">₹{(p.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className={p.status === "captured" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{p.status === "captured" ? "paid" : p.status}</td>
                    <td>{p.status === "captured" || p.status === "refunded" ? <Link href={`/invoice/${p.id}`} className="font-semibold text-brand-primary hover:underline">{p.invoice ?? "View"}</Link> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title="History" subtitle="Every change to your credits, newest first" icon={History} />
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-brand-navy/50">Nothing yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="data-table text-sm">
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
                    <td>{kindLabel(e)}</td>
                    <td className={`num-cell font-semibold tabular-nums ${e.credits < 0 ? "text-brand-navy" : e.credits > 0 ? "text-[#0b6b30]" : "text-brand-navy/45"}`}>{e.credits === 0 ? "free" : `${e.credits > 0 ? "+" : "−"}${Math.abs(e.credits)}`}</td>
                    <td className="num-cell tabular-nums text-brand-navy/60">{fmt(e.monthlyAfter + e.topupAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
