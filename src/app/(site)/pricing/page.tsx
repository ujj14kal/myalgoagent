import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import Reveal from "@/components/reveal";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import { ACTION_COST, PLANS, TOPUP_PACKS, TRIAL_DAYS, TRIAL_SPEC } from "@/lib/credits/config";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `Start free with a ${TRIAL_DAYS}-day trial of everything except live trading — no card needed. Then stay on Free, or choose Trade (₹1,999/month) or Pro (₹3,499/month). Prices include GST.`,
  path: "/pricing",
});

const fmt = (n: number) => n.toLocaleString("en-IN");

const plans = [
  {
    key: "FREE" as const,
    tagline: "To get to know the platform",
    cta: "Start free",
    features: [
      `${PLANS.FREE.monthlyCredits} credits a month for daily-candle backtests`,
      "2 AI replies to try the assistant",
      `Up to ${PLANS.FREE.slots.forward} forward tests`,
      "Strategy builder, charts, indicators and risk controls",
      "Connect your own broker account",
    ],
  },
  {
    key: "TRADE" as const,
    tagline: "For traders going live",
    cta: "Start free, upgrade any time",
    popular: true,
    features: [
      `${fmt(PLANS.TRADE.monthlyCredits)} credits a month`,
      `AI assistant with voice — up to ${PLANS.TRADE.daily.ai} replies a day`,
      "Intraday and 5-year backtests",
      `Up to ${PLANS.TRADE.slots.live} live strategies and ${PLANS.TRADE.slots.forward} forward tests`,
      "Your own static IP for live orders, created for you",
      "Top up credits whenever you need",
    ],
  },
  {
    key: "PRO" as const,
    tagline: "For active, multi-strategy traders",
    cta: "Start free, upgrade any time",
    features: [
      `${fmt(PLANS.PRO.monthlyCredits)} credits a month`,
      `AI assistant with voice — up to ${PLANS.PRO.daily.ai} replies a day`,
      "Intraday and 5-year backtests",
      `Up to ${PLANS.PRO.slots.live} live strategies and ${PLANS.PRO.slots.forward} forward tests`,
      "Your own static IP for live orders, created for you",
      "Top up credits whenever you need",
    ],
  },
];

const costs: [string, string][] = [
  ["An AI answer", `${ACTION_COST.ai_reply} credits`],
  ["An AI turn that prepares a strategy, block or indicator", `${ACTION_COST.ai_build} credits`],
  ["One spoken exchange", `${ACTION_COST.ai_voice} credits`],
  ["A backtest on daily candles, up to a year", "1 credit"],
  ["An intraday or 5-year backtest", "2 credits"],
];

export default function PricingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Pricing", url: `${siteUrl}/pricing` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/pricing", label: "Pricing" }]} />
      <PageHeader
        eyebrow="Pricing"
        title="Start free. Upgrade when you're ready."
        description={`Every new account starts with a ${TRIAL_DAYS}-day free trial of the paid features — no card needed. After that you stay on Free, or pick a plan. Prices include GST.`}
      />
      <Reveal>
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-4 text-sm text-brand-navy">
            <Sparkles className="mt-0.5 shrink-0 text-brand-gold" size={18} />
            <p>
              <strong>Your first {TRIAL_DAYS} days are on us.</strong> Sign up and try {fmt(TRIAL_SPEC.monthlyCredits)} credits of the AI assistant, voice, intraday backtests and up to {TRIAL_SPEC.slots.forward} forward tests. Going live with real orders needs a paid plan. You can upgrade at any point during the trial, and if you don&apos;t, your account simply continues on Free.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((p) => {
              const spec = PLANS[p.key];
              return (
                <div key={p.key} className={`relative flex flex-col rounded-3xl bg-white p-7 shadow-sm ring-1 ${p.popular ? "ring-2 ring-brand-primary" : "ring-black/10"}`}>
                  {p.popular && <span className="absolute -top-3 left-7 rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
                  <h2 className="text-xl font-bold text-brand-navy">{spec.label}</h2>
                  <p className="mt-1 text-sm text-brand-navy/60">{p.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-brand-navy">{spec.price ? `₹${fmt(spec.price)}` : "₹0"}</span>
                    {spec.price && <span className="text-sm text-brand-navy/55">/month, GST included</span>}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-brand-navy/80">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand-buy" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${p.popular ? "bg-brand-primary text-white hover:bg-brand-primary-light" : "bg-white text-brand-primary ring-1 ring-brand-primary/30 hover:bg-brand-primary/5"}`}
                  >
                    {p.cta}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-7 ring-1 ring-black/10">
              <h2 className="text-lg font-bold text-brand-navy">What credits are used for</h2>
              <p className="mt-1 text-sm text-brand-navy/60">Live trading, risk controls, charts, demos and forward tests never use credits.</p>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {costs.map(([what, c]) => (
                    <tr key={what} className="border-t border-black/5">
                      <td className="py-2.5 pr-4 text-brand-navy/80">{what}</td>
                      <td className="py-2.5 text-right font-semibold text-brand-navy">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-3xl bg-white p-7 ring-1 ring-black/10">
              <h2 className="text-lg font-bold text-brand-navy">Need more credits?</h2>
              <p className="mt-1 text-sm text-brand-navy/60">Top-ups for Trade and Pro. They stay in your account for a year.</p>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {TOPUP_PACKS.map((t) => (
                    <tr key={t.credits} className="border-t border-black/5">
                      <td className="py-2.5 text-brand-navy/80">{fmt(t.credits)} credits</td>
                      <td className="py-2.5 text-right font-semibold text-brand-navy">₹{fmt(t.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-3xl space-y-3 text-sm leading-relaxed text-brand-navy/70">
            <p><strong className="text-brand-navy">How you pay.</strong> Securely through Razorpay — UPI, cards and netbanking, with automatic monthly renewal. Your card details never reach MyAlgoAgent. You can cancel renewal at any time; your plan then runs to the end of the period you&apos;ve already paid for.</p>
            <p><strong className="text-brand-navy">Live trading</strong> uses your own broker account and API, is switched on account by account, and needs a plan that includes it. Trading involves risk, and backtested or forward-tested results are not a guarantee of future performance — see our <Link href="/risk-disclosure" className="font-semibold text-brand-primary hover:underline">Risk Disclosure</Link>. MyAlgoAgent doesn&apos;t give investment advice.</p>
            <p>Questions about a plan? See the <Link href="/faq" className="font-semibold text-brand-primary hover:underline">FAQ</Link> or <Link href="/contact" className="font-semibold text-brand-primary hover:underline">contact us</Link>.</p>
          </div>
        </section>
      </Reveal>
    </>
  );
}
