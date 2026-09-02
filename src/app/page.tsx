import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "MyAlgoAgent — Algo Trading Platform",
  description:
    "Build, backtest, paper trade and run rule-based algo trading strategies with market data, technical indicators and risk controls built in.",
  alternates: { canonical: siteUrl },
};

const workflow = [
  { step: "01", title: "Market Data", text: "Pull historical and near-real-time price data for supported instruments." },
  { step: "02", title: "Strategy Builder", text: "Combine indicators, entry/exit rules and risk parameters — no code required." },
  { step: "03", title: "Backtesting", text: "Simulate the strategy against history with fees, slippage and realistic fills." },
  { step: "04", title: "Paper Trading", text: "Run the strategy live against real market data using virtual capital only." },
  { step: "05", title: "Risk Controls", text: "Set daily loss limits, position caps and a kill switch before going further." },
  { step: "06", title: "Live Execution", text: "Connect a supported broker and run the strategy with real capital, with your explicit authorization." },
];

const features = [
  { title: "No-code strategy builder", text: "Compose entry/exit conditions from indicators, price action and time rules." },
  { title: "Realistic backtesting", text: "Configurable brokerage, fees, slippage and position sizing — not just raw price math." },
  { title: "Paper trading", text: "Validate strategies against live market data with virtual capital before risking real money." },
  { title: "Risk management engine", text: "Daily loss limits, position caps, per-strategy exposure limits and an emergency kill switch." },
  { title: "Portfolio & order tracking", text: "Positions, P&L, open orders and fills in one dashboard, reconciled with your broker." },
  { title: "Alerts & audit logs", text: "Signal, fill and risk-limit alerts, plus an audit trail for every trading action." },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-black/5 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">
              Algo Trading Software
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">
              Build, backtest and run trading strategies without guesswork.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-brand-navy/70">
              MyAlgoAgent is a software platform for creating rule-based
              trading strategies, testing them against history, and running
              them in paper or live mode with risk controls built in.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/product"
                className="rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light"
              >
                See how it works
              </Link>
              <Link
                href="/technology"
                className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
              >
                Technology & AWS infrastructure
              </Link>
            </div>
            <p className="mt-6 text-xs text-brand-navy/50">
              Algo trading involves substantial risk. Backtested and
              historical performance does not guarantee future results. See
              our <Link href="/risk-disclosure" className="underline">Risk Disclosure</Link>.
            </p>
          </div>
          <div className="flex justify-center">
            <Image
              src="/brand/icon-mark.svg"
              alt="MyAlgoAgent"
              width={280}
              height={280}
              priority
              className="drop-shadow-xl"
            />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-brand-navy">How the platform works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-brand-navy/70">
            One workflow, from raw market data to a fully risk-managed live
            strategy.
          </p>
        </div>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workflow.map((s) => (
            <li key={s.step} className="rounded-2xl border border-black/5 bg-white p-6">
              <span className="text-sm font-bold text-brand-gold">{s.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-brand-navy">{s.title}</h3>
              <p className="mt-2 text-sm text-brand-navy/65">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="border-y border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-brand-navy">Core features</h2>
            <p className="mx-auto mt-3 max-w-2xl text-brand-navy/70">
              Everything needed to go from idea to a monitored, risk-managed
              strategy.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-black/5 p-6">
                <h3 className="text-lg font-semibold text-brand-navy">{f.title}</h3>
                <p className="mt-2 text-sm text-brand-navy/65">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="risk" className="mx-auto max-w-6xl px-4 py-20">
        <div className="rounded-3xl bg-brand-navy px-8 py-16 text-center text-white">
          <h2 className="text-3xl font-bold">Risk-first by design</h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Every strategy runs behind configurable position limits, daily
            loss limits and a global kill switch — enforced independently of
            the interface, not just suggested by it.
          </p>
          <Link
            href="/risk-management"
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-navy hover:bg-white/90"
          >
            Explore risk management
          </Link>
        </div>
      </section>

      <section id="get-started" className="mx-auto max-w-6xl px-4 pb-24">
        <div className="rounded-3xl border border-black/5 bg-white px-8 py-14 text-center">
          <h2 className="text-2xl font-bold text-brand-navy">
            Start with the product overview
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-navy/70">
            Read a plain-language walkthrough of the whole platform, or dig
            into the technology and AWS infrastructure behind it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/product"
              className="rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light"
            >
              Product Overview
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
