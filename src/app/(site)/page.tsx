import Link from "next/link";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = {
  description:
    "Build, backtest, paper trade and run rule-based algo trading strategies with market data, technical indicators and risk controls built in.",
  alternates: { canonical: siteUrl },
};

const workflow = [
  { step: "01", title: "Market Data", text: "Pull historical and near-real-time price data for supported instruments.", icon: "radio" as const },
  { step: "02", title: "Strategy Builder", text: "Combine indicators, entry/exit rules and risk parameters — no code required.", icon: "braces" as const },
  { step: "03", title: "Backtesting", text: "Simulate the strategy against history with fees, slippage and realistic fills.", icon: "chart" as const },
  { step: "04", title: "Paper Trading", text: "Run the strategy live against real market data using virtual capital only.", icon: "layers" as const },
  { step: "05", title: "Risk Controls", text: "Set daily loss limits, position caps and a kill switch before going further.", icon: "shield" as const },
  { step: "06", title: "Live Execution", text: "Connect a supported broker and run the strategy with real capital, with your explicit authorization.", icon: "route" as const },
];

const capabilities = [
  { title: "No-code strategy builder", text: "Compose entry/exit conditions from indicators, price action and time rules." },
  { title: "Realistic backtesting", text: "Configurable brokerage, fees, slippage and position sizing — not just raw price math." },
  { title: "Paper trading", text: "Validate strategies against live market data with virtual capital before risking real money." },
  { title: "Risk management engine", text: "Daily loss limits, position caps, per-strategy exposure limits and an emergency kill switch." },
  { title: "Portfolio & order tracking", text: "Positions, P&L, open orders and fills in one dashboard, reconciled with your broker." },
  { title: "Alerts & audit logs", text: "Signal, fill and risk-limit alerts, plus an audit trail for every trading action." },
];

const faqs = [
  { q: "Can I test without risking real capital?", a: "Yes. Paper trading runs a strategy against live market data using virtual capital before any live broker execution." },
  { q: "Does a successful backtest guarantee results?", a: "No. Historical and backtested results are illustrative and cannot guarantee future performance." },
  { q: "How is live trading authorized?", a: "You connect a supported broker and explicitly authorize execution. You can disconnect the broker or use the kill switch at any time." },
];

function Icon({ name, size = 18 }: { name: "radio" | "braces" | "chart" | "layers" | "shield" | "route" | "check" | "arrow" | "gauge" | "lock" | "stop"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "radio":
      return <svg {...common}><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
    case "braces":
      return <svg {...common}><path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "layers":
      return <svg {...common}><path d="M12 3l9 5-9 5-9-5 9-5Z" /><path d="M3 13l9 5 9-5" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "route":
      return <svg {...common}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M5 8v3a4 4 0 0 0 4 4h6a4 4 0 0 1 4 4" /></svg>;
    case "check":
      return <svg {...common}><path d="M5 12l5 5L19 7" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "gauge":
      return <svg {...common}><path d="M12 12l4-4" /><path d="M4 15a8 8 0 1 1 16 0" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    case "stop":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" /></svg>;
  }
}

export default function Home() {
  return (
    <>
      <section className="gradient-mesh border-b border-black/5">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
          <div className="[animation:slide-up_0.7s_ease_both]">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-buy opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-buy" />
              </span>
              Algo Trading Software
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">
              Build strategies. <span className="text-brand-primary">Test every assumption.</span> Control every trade.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-brand-navy/70">
              MyAlgoAgent brings strategy building, realistic backtesting,
              paper trading and live execution into one risk-managed
              workflow.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/product"
                className="group inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-primary-light hover:shadow-lg hover:shadow-brand-primary/25"
              >
                See how it works
                <Icon name="arrow" size={15} />
              </Link>
              <Link
                href="/technology"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-navy hover:text-brand-primary"
              >
                Technology & AWS infrastructure
                <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-5 text-xs text-brand-navy/60">
              <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> No-code workflow</span>
              <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> Broker-authorized execution</span>
              <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> Auditable controls</span>
            </div>
          </div>

          <div className="[animation:scale-in_0.7s_ease_0.15s_both]">
            <div className="hover-lift overflow-hidden rounded-2xl border border-white/10 bg-brand-navy text-white shadow-2xl shadow-brand-navy/20">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-buy" />
                  Backtest summary
                </div>
                <span className="font-mono text-[11px] text-white/40">RUN #EMA-042</span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-white/10">
                <div className="bg-brand-navy p-4">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Win rate</p>
                  <p className="mt-1 text-2xl font-bold text-brand-buy">62%</p>
                  <p className="text-[10px] text-white/30">Illustrative</p>
                </div>
                <div className="bg-brand-navy p-4">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Sharpe ratio</p>
                  <p className="mt-1 text-2xl font-bold text-white">1.8</p>
                  <p className="text-[10px] text-white/30">Risk adjusted</p>
                </div>
                <div className="bg-brand-navy p-4">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">Max drawdown</p>
                  <p className="mt-1 text-2xl font-bold text-brand-sell">-9%</p>
                  <p className="text-[10px] text-white/30">Historical</p>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <span>Equity curve</span>
                  <span>EMA Crossover + RSI</span>
                </div>
                <svg viewBox="0 0 600 170" className="mt-2 h-[150px] w-full text-brand-gold" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="currentColor" stopOpacity="0.25" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 30H600M0 85H600M0 140H600" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <path
                    d="M0 145 L45 132 L80 139 L125 112 L165 120 L212 83 L260 92 L310 69 L355 75 L398 42 L445 52 L490 29 L535 35 L600 12 L600 170 L0 170Z"
                    fill="url(#equityFill)"
                  />
                  <path
                    d="M0 145 L45 132 L80 139 L125 112 L165 120 L212 83 L260 92 L310 69 L355 75 L398 42 L445 52 L490 29 L535 35 L600 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] text-white/40">
                <span className="flex items-center gap-1.5 text-brand-buy"><Icon name="shield" size={13} /> Risk controls Active</span>
                <span>Illustrative only — not live performance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Reveal>
        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">One connected workflow</p>
            <h2 className="mt-2 text-3xl font-bold text-brand-navy">From market data to monitored execution</h2>
            <div className="accent-bar mx-auto mt-3" />
            <p className="mx-auto mt-4 max-w-2xl text-brand-navy/70">
              Each stage preserves the same strategy logic and places a
              deliberate risk gate before real capital is involved.
            </p>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {workflow.map((s) => (
              <li key={s.step} className="hover-lift group rounded-2xl border border-black/5 bg-white p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/15 text-sm font-bold text-brand-gold">
                    {s.step}
                  </span>
                  <span className="text-brand-primary/60 transition-colors group-hover:text-brand-primary">
                    <Icon name={s.icon} size={20} />
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-brand-navy">{s.title}</h3>
                <p className="mt-2 text-sm text-brand-navy/65">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      <Reveal>
        <section id="risk" className="border-y border-black/5 bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Risk-first by design</p>
              <h2 className="mt-2 text-3xl font-bold text-brand-navy">Controls that sit between every strategy and the market</h2>
              <p className="mt-4 text-brand-navy/70">
                Risk settings are enforced independently of the interface.
                They are operating rules — not decorative warnings.
              </p>
              <Link href="/risk-management" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-navy hover:text-brand-primary">
                Read the risk disclosure <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className="hover-lift overflow-hidden rounded-2xl bg-brand-navy text-white shadow-xl shadow-brand-navy/15">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-sm font-semibold">
                <span>Live control status</span>
                <span className="flex items-center gap-2 text-xs font-medium text-brand-buy">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-buy" /> Systems active
                </span>
              </div>
              {[
                { icon: "gauge" as const, label: "Daily loss limit", sub: "Stops new orders at your threshold", status: "Configured" },
                { icon: "lock" as const, label: "Position cap", sub: "Limits concentration per strategy", status: "Active" },
                { icon: "stop" as const, label: "Global kill switch", sub: "Halt execution across strategies", status: "Armed" },
              ].map((row, i, arr) => (
                <div key={row.label} className={`flex items-center justify-between px-6 py-5 ${i < arr.length - 1 ? "border-b border-white/10" : ""}`}>
                  <div className="flex items-center gap-3.5">
                    <span className="text-brand-gold"><Icon name={row.icon} size={19} /></span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{row.label}</span>
                      <span className="mt-0.5 text-xs text-white/40">{row.sub}</span>
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-brand-buy">{row.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="features" className="bg-brand-bg">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Core capabilities</p>
              <h2 className="mt-2 text-3xl font-bold text-brand-navy">One operational view. No missing pieces.</h2>
              <div className="accent-bar mx-auto mt-3" />
            </div>
            <div className="mt-10 divide-y divide-black/5 border-y border-black/5">
              {capabilities.map((f, i) => (
                <div key={f.title} className="group grid grid-cols-[40px_1fr_20px] items-center gap-5 px-2 py-6 transition-colors hover:bg-white">
                  <span className="font-mono text-xs font-bold text-brand-gold">0{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-brand-navy">{f.title}</h3>
                    <p className="mt-1 text-sm text-brand-navy/65">{f.text}</p>
                  </div>
                  <span className="text-brand-navy/25 transition-all group-hover:translate-x-1 group-hover:text-brand-primary">
                    <Icon name="arrow" size={18} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="technology" className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-16 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Technology & AWS</p>
              <h2 className="mt-2 text-3xl font-bold text-brand-navy">Infrastructure designed for continuous, auditable operation</h2>
              <p className="mt-4 text-brand-navy/70">
                The platform separates strategy logic, risk checks and
                broker execution so each step can be monitored and
                controlled.
              </p>
              <Link href="/technology" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light">
                Discuss the platform <Icon name="arrow" size={15} />
              </Link>
            </div>
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_28px_1fr_28px_1fr]">
              {[
                { n: "01", title: "Market data", sub: "Historical and near-real-time inputs" },
                { n: "02", title: "Strategy + risk engine", sub: "Rules validated before execution" },
                { n: "03", title: "Broker gateway", sub: "Authorized orders and reconciled fills" },
              ].map((step, i, arr) => (
                <div key={step.n} className="contents">
                  <div className="hover-lift flex min-h-[170px] flex-col border-t-[3px] border-brand-primary bg-white p-5 shadow-sm">
                    <span className="font-mono text-xs font-bold text-brand-gold">{step.n}</span>
                    <span className="mt-8 font-semibold text-brand-navy">{step.title}</span>
                    <span className="mt-1.5 text-xs leading-relaxed text-brand-navy/55">{step.sub}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="hidden h-px w-full bg-brand-primary/30 sm:block" aria-hidden>
                      <div className="relative -top-[3.5px] float-right h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-brand-primary/60" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="disclosure" className="bg-brand-primary text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Icon name="shield" size={24} />
              <div>
                <p className="text-sm font-bold text-white">Important risk disclosure</p>
                <p className="mt-1 max-w-2xl text-sm text-white/75">
                  Algo trading involves substantial risk. Backtested and
                  historical performance does not guarantee future results.
                  MyAlgoAgent is software — not investment advice, a
                  broker-dealer, exchange or investment adviser.
                </p>
              </div>
            </div>
            <Link href="/terms" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold whitespace-nowrap hover:text-brand-gold">
              Review terms <Icon name="arrow" size={14} />
            </Link>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="faq" className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-14 lg:grid-cols-[0.6fr_1.4fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Frequently asked</p>
              <h2 className="mt-2 text-3xl font-bold text-brand-navy">Clear answers before you begin</h2>
            </div>
            <div className="divide-y divide-black/5 border-t border-black/5">
              {faqs.map((f) => (
                <details key={f.q} className="group py-6">
                  <summary className="flex cursor-pointer items-center justify-between text-lg font-semibold text-brand-navy">
                    {f.q}
                    <span className="ml-4 shrink-0 text-brand-primary transition-transform group-open:rotate-45">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-navy/65">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="get-started" className="mx-auto max-w-6xl px-4 pb-24">
          <div className="hover-lift rounded-3xl border border-black/5 bg-white px-8 py-14 text-center">
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
                className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-blue hover:text-brand-blue"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    </>
  );
}
