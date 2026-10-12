"use client";

import Link from "next/link";
import { ACTION_COST, ACTION_LABEL, PLANS, PLAN_ORDER, TOPUP_PACKS, type CreditAction } from "@/lib/credits/config";
import type { CreditEventRow } from "@/lib/credits/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Coins, History, ListChecks, ShoppingBag } from "lucide-react";
import { useCredits } from "./credits-provider";

const fmt = (n: number) => n.toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const kindLabel = (e: CreditEventRow) => (e.kind === "SPEND" ? (ACTION_LABEL[e.action as CreditAction] ?? "Used") : e.kind === "RESET" ? "Monthly credits renewed" : e.kind === "PLAN" ? "Plan changed" : e.kind === "TOPUP" ? "Top-up" : "Credits added");

/** Where the credits stand (live), what everything costs, the plans, and the history. */
export default function UsagePanel({ events }: { events: CreditEventRow[] }) {
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
        {snap.aiRepliesLeft !== null && (
          <p className="mt-3 rounded-lg bg-brand-primary/[0.06] px-3 py-2 text-sm text-brand-navy/75">
            The Free plan includes <strong>2 AI replies, once</strong> — <strong>{snap.aiRepliesLeft}</strong> left. Backtests on daily candles use the monthly credits.
          </p>
        )}
        {snap.plan !== "FREE" && (
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
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const spec = PLANS[p];
              return (
                <div key={p} className={`rounded-xl border p-3 text-sm ${snap.plan === p ? "border-brand-primary bg-brand-primary/[0.05]" : "border-brand-navy/10"}`}>
                  <p className="font-bold text-brand-navy">{spec.label}</p>
                  <p className="num text-lg font-bold tabular-nums">{spec.price ? `₹${fmt(spec.price)}` : "₹0"}<span className="text-xs font-normal text-brand-navy/50">{spec.price ? "/month" : ""}</span></p>
                  <p className="mt-1 text-xs text-brand-navy/60">{p === "FREE" ? `${spec.monthlyCredits} credits a month for daily backtests, and 2 AI replies in all` : `${fmt(spec.monthlyCredits)} credits a month`}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-navy/45">Top-ups (Trade and Pro)</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {TOPUP_PACKS.map((t) => (
              <li key={t.credits} className="rounded-lg bg-brand-bg px-3 py-2">
                <span className="num font-semibold tabular-nums">{fmt(t.credits)}</span> credits · <span className="num tabular-nums">₹{fmt(t.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brand-navy/55">
            Online payment isn&apos;t switched on yet. To change plan or add credits now,{" "}
            <Link href="/app/support" className="font-semibold text-brand-primary hover:underline">
              contact support
            </Link>
            .
          </p>
        </Card>
      </div>

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
