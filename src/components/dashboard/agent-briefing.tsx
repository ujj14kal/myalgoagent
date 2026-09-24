"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

export type BriefingLine = { text: string; tone?: "good" | "warn" | "bad" | "neutral" };

const DOT: Record<NonNullable<BriefingLine["tone"]>, string> = {
  good: "bg-brand-buy",
  warn: "bg-brand-gold",
  bad: "bg-brand-sell",
  neutral: "bg-white/40",
};

/**
 * The agent's daily briefing. Every line is a plain statement of the
 * account's real state — the agent reports, it never recommends a trade.
 */
export default function AgentBriefing({
  agentName,
  greeting,
  pose,
  lines,
  primaryAction,
  secondaryAction,
}: {
  agentName: string;
  greeting: string;
  pose: AgentPose;
  lines: BriefingLine[];
  primaryAction: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  const reduce = useReducedMotion();
  return (
    <section className="app-sidebar-bg relative overflow-hidden rounded-3xl px-5 py-6 text-white shadow-[0_24px_48px_-24px_rgba(43,16,102,0.7)] sm:px-8 sm:py-7">
      {/* soft light rings behind the agent — desktop polish, cheap to paint */}
      <div className="pointer-events-none absolute -right-20 -top-24 hidden h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(70,111,255,0.22),transparent_65%)] md:block" />
      <div className="pointer-events-none absolute bottom-0 right-40 hidden h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(189,163,96,0.25),transparent_70%)] md:block" />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold-light">{agentName} · daily briefing</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{greeting}</h1>
          <ul className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <motion.li
                key={l.text}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.35 }}
                className="flex items-start gap-2.5 text-sm text-white/80"
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[l.tone ?? "neutral"]}`} />
                <span>{l.text}</span>
              </motion.li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href={primaryAction.href}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-primary shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5"
            >
              {primaryAction.label}
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white/85 ring-1 ring-white/25 transition-colors hover:bg-white/10"
              >
                {secondaryAction.label}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-center md:-my-4 md:mr-2">
          <Agent2D pose={pose} size={150} className="drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]" />
        </div>
      </div>
    </section>
  );
}
