import Link from "next/link";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import { BROKERS } from "@/lib/brokers/catalog";
import HeroScene from "@/components/site/hero-scene";
import Preloader from "@/components/site/preloader";
import ModuleExplorer, { type Module } from "@/components/site/module-explorer";
import CapabilityIndex from "@/components/site/capability-index";
import SupportForm from "@/components/support-form";
import { PageMotion } from "@/components/site/site-motion";
import { Ic, type IconName } from "@/components/site/icons";

export const metadata: Metadata = {
  description: "Build, backtest, forward test and run rule-based algo trading strategies on your own broker account, with risk controls built in.",
  alternates: { canonical: siteUrl },
};

const liveBrokers = BROKERS.filter((b) => b.availability === "live");

const pillars: { icon: IconName; title: string; text: string }[] = [
  { icon: "braces", title: "Build", text: "Compose entry and exit rules from indicators, price action, patterns and time — no code required." },
  { icon: "chart", title: "Test", text: "Backtest with fees, slippage and realistic fills, then forward test on live candles with notional capital." },
  { icon: "route", title: "Go live", text: "Send a tested strategy's orders to your own broker automatically, from your own static IP." },
  { icon: "shield", title: "Stay in control", text: "Per-order and daily limits, a losing-streak limit and a kill switch, enforced on our servers." },
];

const products: { icon: IconName; title: string; text: string; href: string }[] = [
  { icon: "braces", title: "Strategy builder", text: "Indicators, candlestick and chart patterns, other timeframes and stocks, time-of-day rules — combined visually or as code.", href: "/features" },
  { icon: "chart", title: "Backtesting", text: "Configurable brokerage, slippage and position sizing, with an animated replay of every entry and exit.", href: "/backtesting" },
  { icon: "layers", title: "Forward testing", text: "Run a strategy forward on daily or intraday candles with notional capital before any real money.", href: "/forward-testing" },
  { icon: "pulse", title: "Live trading", text: "Go live on your broker: every check, signal and order logged in plain English as it happens.", href: "/live-trading" },
  { icon: "options", title: "Options Lab", text: "Multi-leg payoffs, breakevens, max profit and loss and Greeks before you trade.", href: "/features" },
  { icon: "mic", title: "Your AI agent", text: "Type it or say it: your agent drafts strategies, backtests and limits for you to review and confirm.", href: "/product" },
];

const capabilities = [
  { id: "cap-build", label: "Strategy building", title: "Rules you can read, exactly as they run", points: ["Visual builder or code, evaluated identically", "Custom indicators: formulas, lines, levels, zones, channels and bands", "Feasibility checks catch contradictions and rules that can never fire"] },
  { id: "cap-test", label: "Testing", title: "Test every assumption first", points: ["Backtests with brokerage, slippage and realistic next-candle fills", "Forward tests on live candles with notional capital only", "Results labelled as hypothetical — never presented as a promise"] },
  { id: "cap-live", label: "Live execution", title: "Your broker, your account, your keys", points: ["Readiness check that places no order", "Orders checked against your limits before they leave", "A plain-English, timestamped log of everything the engine does"] },
  { id: "cap-risk", label: "Risk controls", title: "Limits our servers enforce", points: ["Per-order value and daily limits", "Losing-streak limit and a global kill switch", "Pause, exit now or stop any strategy at any time"] },
  { id: "cap-data", label: "Brokers & data", title: "Connect the broker you already use", points: [`${liveBrokers.length} Indian brokers with your own API key, encrypted`, "Prices from your own broker account where it supplies data", "Broker calls leave from a static IP registered on your account"] },
];

const modules: Module[] = [
  { id: "builder", label: "Strategy builder", title: "Build without code", text: "Pick indicators, patterns and time rules; every rule reads back in plain English before you save it.", points: ["Visual or code — same engine", "Multi-timeframe and multi-stock rules", "Feasibility checked on real data"], href: "/features" },
  { id: "backtest", label: "Backtesting", title: "Realistic backtests", text: "Simulate against history with brokerage, slippage and next-candle fills, then replay every trade.", points: ["Configurable costs and sizing", "Animated signal replay", "Hypothetical results, clearly labelled"], href: "/backtesting" },
  { id: "forward", label: "Forward testing", title: "Prove it forward", text: "Let a strategy run on live candles with notional capital and see how it behaves before risking money.", points: ["Daily and intraday", "Same engine as live trading", "No orders placed"], href: "/forward-testing" },
  { id: "live", label: "Live engine", title: "Live, on your own broker", text: "Checked every few seconds in market hours; orders go to your broker automatically within your limits.", points: ["Readiness check first", "Timestamped plain-English log", "Pause, exit now, stop"], href: "/live-trading" },
  { id: "risk", label: "Risk controls", title: "Controls that can't be skipped", text: "Limits are enforced by our servers before every new position — not by the page you're looking at.", points: ["Per-order and daily limits", "Losing-streak limit", "Global kill switch"], href: "/risk-management" },
  { id: "options", label: "Options Lab", title: "Understand an options position", text: "Build multi-leg positions from templates and see payoff, breakevens and Greeks at a glance.", points: ["Payoff today and at expiry", "Max profit and loss", "Position Greeks"], href: "/features" },
  { id: "agent", label: "AI agent", title: "An agent you can talk to", text: "Type or speak; it prepares strategies, backtests and limits with the same building blocks, and you confirm.", points: ["Voice or text", "Reads the market and your account", "Never places an order on its own"], href: "/product" },
  { id: "brokers", label: "Broker connections", title: "Bring your own broker", text: `Connect any of ${liveBrokers.length} Indian brokers with your own API key; you log in on the broker's own page.`, points: ["Keys encrypted (AES-256)", "Static IP for live orders", "Prices from your own account"], href: "/live-trading" },
];

const audiences: { icon: IconName; title: string; text: string }[] = [
  { icon: "user", title: "New to algo trading", text: "Describe an idea to your agent, see it as rules, and test it with notional capital before anything is real." },
  { icon: "target", title: "Active traders", text: "Turn the setups you already trade into rules that are checked every few seconds — with limits you set." },
  { icon: "options", title: "Options traders", text: "Model multi-leg positions, payoffs and Greeks before placing a single order." },
  { icon: "code", title: "Developers & quants", text: "Write rules as code, bring TradingView alerts in by webhook, and keep every rule visible." },
];

const process = [
  { n: "01", title: "Connect your broker", text: "Use your own API key; log in on the broker's own page. We never see your password or 2FA." },
  { n: "02", title: "Build the strategy", text: "Entry and exit rules, sizing, stop-loss, target and trailing stop — visually, in code or with your agent." },
  { n: "03", title: "Backtest it", text: "Run it against history with costs and slippage, and replay every trade." },
  { n: "04", title: "Forward test it", text: "Let it run forward on live candles with notional capital only." },
  { n: "05", title: "Set your limits", text: "Per-order and daily limits, a losing-streak limit and the kill switch." },
  { n: "06", title: "Go live", text: "Pass the readiness check, press Go live, and follow every step in the live log." },
];

const why: { icon: IconName; title: string; text: string }[] = [
  { icon: "eye", title: "White-box by design", text: "Every rule is visible and editable. No black-box signals, no tips." },
  { icon: "plug", title: "Your broker, your keys", text: "Orders go to your own account; keys are encrypted and locked to you." },
  { icon: "shield", title: "Server-side limits", text: "Loss limits and the kill switch are checked before every new position." },
  { icon: "log", title: "Plain-English logs", text: "A timestamped log tells you what the engine checked, sent and why." },
  { icon: "globe", title: "Built for Indian markets", text: "NSE stocks, Indian brokers, IST sessions — on AWS infrastructure in India." },
  { icon: "lock", title: "Encrypted everywhere", text: "HTTPS on every connection, data encrypted at rest, broker keys sealed with AES-256." },
];

const marquee = ["Strategy builder", "Backtesting", "Forward testing", "Live trading", "Risk controls", "Options Lab", "AI agent", ...liveBrokers.map((b) => b.name)];

export default function Home() {
  return (
    <>
      <Preloader />

      {/* ---------- hero ---------- */}
      <section data-full-bleed className="mk-light relative isolate flex min-h-[100svh] items-center overflow-hidden pb-16 pt-28">
        <div className="mk-grid-bg" data-speed="0.15" aria-hidden />
        <div className="mk-glow left-[-10%] top-[10%] h-[420px] w-[420px] bg-[var(--mk-accent-2)]" data-speed="0.35" aria-hidden />
        <div className="mk-glow bottom-[-5%] right-[5%] h-[360px] w-[360px] bg-[var(--mk-gold)]" data-speed="0.55" aria-hidden />
        <div className="mk-outline-word bottom-[4%] left-[-2%] text-[22vw]" data-speed="0.25" aria-hidden>
          ALGO
        </div>
        <HeroScene className="pointer-events-none absolute inset-0 z-0 opacity-30 md:left-[48%] md:opacity-100" />
        <div className="mk-wrap relative z-10">
          <div data-hero-drift className="max-w-[720px]">
            <p className="mk-eyebrow !text-[var(--mk-ink)]" data-rise>
              <span className="mk-pulse" aria-hidden /> Algo trading software · Indian markets
            </p>
            <h1 className="mk-display mk-h1 mt-6" data-split="now" data-delay="0.15">
              Build strategies. <em>Test every assumption.</em> Control every trade.
            </h1>
            <p className="mk-lead mt-7 max-w-xl" data-rise data-delay="0.35">
              Strategy building, realistic backtesting and forward testing in one risk-managed workflow — then take a tested strategy live on your own broker, inside the limits you set.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3" data-rise data-delay="0.5">
              <Link href="/signup" className="mk-btn" data-magnetic>
                Start free <Ic name="arrow" size={16} />
              </Link>
              <Link href="/product" className="mk-btn mk-btn--ghost" data-magnetic>
                See how it works
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" data-stagger>
              {["No-code workflow", "Forward test with notional capital", "Server-side limits"].map((t) => (
                <li key={t} className="mk-chip">
                  <Ic name="check" size={14} /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 md:block" aria-hidden>
          <div className="mk-cue" />
        </div>
      </section>

      {/* ---------- marquee ---------- */}
      <div className="relative z-10 -my-6 py-6" aria-hidden>
        <div className="mk-marquee" data-marquee="38">
          <div className="mk-marquee__track">
            {[...marquee, ...marquee].map((t, i) => (
              <span key={i} className="mk-marquee__item">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- what we do ---------- */}
      <section className="mk-section mk-tint">
        <div className="mk-dots right-[6%] top-[12%] h-40 w-40 text-[var(--mk-accent)]" data-speed="0.4" aria-hidden />
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-rise>
            What we do
          </p>
          <p className="mk-display mk-h2 mt-6 max-w-5xl" data-scrub-words>
            One workflow from idea to execution — every rule visible, every result tested, and <span data-accent>every order inside limits you set.</span>
          </p>
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" data-stagger>
            {pillars.map((p) => (
              <article key={p.title} className="mk-card mk-pillar" data-tilt>
                <span className="mk-icon">
                  <Ic name={p.icon} size={22} />
                </span>
                <h3 className="mk-display mk-h3 mt-8">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed">{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- products ---------- */}
      <section className="mk-section mk-light">
        <div className="mk-wrap">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mk-eyebrow" data-rise>
                The platform
              </p>
              <h2 className="mk-display mk-h2 mt-5 max-w-3xl" data-split>
                Everything a rule-based trader needs, <em>in one place.</em>
              </h2>
            </div>
            <Link href="/product" className="mk-btn mk-btn--ghost" data-magnetic data-rise>
              Product overview <Ic name="arrow" size={16} />
            </Link>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3" data-stagger>
            {products.map((p, i) => (
              <Link key={p.title} href={p.href} className="mk-card group block" data-tilt>
                <div className="flex items-start justify-between">
                  <span className="mk-icon">
                    <Ic name={p.icon} size={22} />
                  </span>
                  <span className="font-mono text-xs font-bold text-[var(--mk-gold)]">0{i + 1}</span>
                </div>
                <h3 className="mk-display mk-h3 mt-8">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed">{p.text}</p>
                {i === 1 && (
                  <svg viewBox="0 0 300 70" className="mt-6 h-16 w-full text-[var(--mk-accent)]" aria-hidden>
                    <path d="M0 62 L30 55 L55 58 L85 44 L110 48 L140 30 L170 36 L200 22 L230 26 L260 12 L300 6" fill="none" stroke="currentColor" strokeWidth="2.5" data-draw />
                  </svg>
                )}
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--mk-accent)]">
                  Learn more <Ic name="arrow" size={15} className="transition-transform duration-500 group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- capabilities (sticky index + panels) ---------- */}
      <section className="mk-section mk-tint">
        <div className="mk-wrap grid gap-12 lg:grid-cols-[280px_1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="mk-eyebrow" data-rise>
              Capabilities
            </p>
            <h2 className="mk-display mk-h3 mt-5" data-split>
              What you can do with it
            </h2>
            <div className="mt-8 hidden lg:block">
              <CapabilityIndex items={capabilities.map(({ id, label }) => ({ id, label }))} />
            </div>
          </div>
          <div className="space-y-6">
            {capabilities.map((c, i) => (
              <article key={c.id} id={c.id} className="mk-card scroll-mt-28" data-rise data-tilt="3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--mk-gold)]">{c.label}</span>
                  <span className="font-mono text-sm text-[var(--mk-ink-soft)]">
                    {String(i + 1).padStart(2, "0")} / {String(capabilities.length).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mk-display mk-h3 mt-5">{c.title}</h3>
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                  {c.points.map((pt) => (
                    <li key={pt} className="rounded-[var(--mk-r-sm)] bg-[var(--mk-paper-2)] p-4 text-sm leading-relaxed text-[var(--mk-ink-soft)]">
                      <Ic name="check" size={16} className="mb-2 text-[var(--mk-accent)]" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            <div className="grid grid-cols-2 gap-5" data-stagger>
              <div className="mk-card">
                <p className="mk-display text-5xl text-[var(--mk-accent)]" data-count={liveBrokers.length}>
                  {liveBrokers.length}
                </p>
                <p className="mt-2 text-sm">Indian brokers you can connect today</p>
              </div>
              <div className="mk-card">
                <p className="mk-display text-5xl text-[var(--mk-accent)]" data-count="15">
                  15
                </p>
                <p className="mt-2 text-sm">seconds between live strategy checks in market hours</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- featured platform ---------- */}
      <section className="mk-section mk-dark overflow-hidden" data-theme="dark">
        <div className="mk-grid-bg" data-speed="0.2" aria-hidden />
        <div className="mk-glow left-[30%] top-[20%] h-[480px] w-[480px] bg-[var(--mk-accent)]" data-speed="0.4" aria-hidden />
        <div className="mk-wrap relative">
          <p className="mk-eyebrow" data-rise>
            Inside MyAlgoAgent
          </p>
          <h2 className="mk-display mk-h2 mt-5 max-w-3xl" data-split>
            Eight modules. <em>One engine.</em>
          </h2>
          <p className="mk-lead mt-6 max-w-2xl" data-rise>
            Backtests, forward tests and live strategies share the same engine and the same rules — what you test is what runs.
          </p>
          <div className="mt-16">
            <ModuleExplorer modules={modules} />
          </div>
        </div>
      </section>

      {/* ---------- solutions ---------- */}
      <section className="mk-section mk-light">
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-rise>
            Who it&apos;s for
          </p>
          <h2 className="mk-display mk-h2 mt-5 max-w-3xl" data-split>
            Built for how <em>you</em> trade.
          </h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2" data-stagger>
            {audiences.map((a) => (
              <article key={a.title} className="mk-card flex gap-5" data-tilt="4">
                <span className="mk-icon shrink-0">
                  <Ic name={a.icon} size={22} />
                </span>
                <div>
                  <h3 className="mk-display mk-h3">{a.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed">{a.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- process (pinned horizontal on desktop) ---------- */}
      <section className="mk-dark relative overflow-hidden lg:flex lg:h-screen lg:flex-col lg:justify-center" data-theme="dark" data-hscroll>
        <div className="mk-outline-word right-[-4%] top-[6%] text-[18vw]" aria-hidden>
          PROCESS
        </div>
        <div className="mk-wrap relative py-[var(--mk-section)] lg:py-0">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mk-eyebrow" data-rise>
                How it works
              </p>
              <h2 className="mk-display mk-h2 mt-5" data-split>
                Six steps to <em>live.</em>
              </h2>
            </div>
            <div className="hidden w-64 lg:block">
              <div className="mk-meter">
                <i data-meter />
              </div>
            </div>
          </div>
          <div className="mk-hscroll__track mt-12 flex-col lg:flex-row" data-connectors>
            {process.map((s, i) => (
              <article key={s.n} className="mk-card mk-hscroll__card relative">
                <span className="mk-display text-6xl text-[var(--mk-gold)]">{s.n}</span>
                <h3 className="mk-display mk-h3 mt-6 text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed">{s.text}</p>
                {i < process.length - 1 && <span data-connector className="absolute -right-6 top-1/2 hidden h-px w-6 bg-[var(--mk-gold)] lg:block" aria-hidden />}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- why us ---------- */}
      <section className="mk-section mk-tint">
        <div className="mk-wrap">
          <p className="mk-eyebrow" data-rise>
            Why MyAlgoAgent
          </p>
          <h2 className="mk-display mk-h2 mt-5 max-w-3xl" data-split>
            Trust built into <em>every layer.</em>
          </h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
            {why.map((w) => (
              <article key={w.title} className="mk-card mk-why">
                <span className="mk-icon">
                  <Ic name={w.icon} size={22} />
                </span>
                <h3 className="mk-display mt-6 text-xl tracking-tight">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed">{w.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-14 flex flex-col gap-4 rounded-[var(--mk-r)] bg-[var(--mk-accent)] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8" data-rise>
            <div className="flex items-start gap-4">
              <Ic name="shield" size={26} className="mt-0.5 shrink-0 text-[var(--mk-gold)]" />
              <p className="max-w-3xl text-sm leading-relaxed !text-white/85">
                <strong className="text-white">Important risk disclosure.</strong> Algo trading involves substantial risk. Backtested and historical performance does not guarantee future results. MyAlgoAgent is software — not investment advice, a broker-dealer, exchange or investment adviser.
              </p>
            </div>
            <Link href="/risk-disclosure" className="mk-btn mk-btn--gold shrink-0">
              Read the disclosure <Ic name="arrow" size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- contact ---------- */}
      <section id="contact" className="mk-section mk-light">
        <div className="mk-wrap grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div>
            <p className="mk-eyebrow" data-rise>
              Contact
            </p>
            <h2 className="mk-display mk-h2 mt-5" data-split>
              Questions? <em>Ask a person.</em>
            </h2>
            <p className="mk-lead mt-6 max-w-md" data-rise>
              Tell us what you&apos;re trying to build or what&apos;s unclear. Every message is read by a person on the MyAlgoAgent team — not an auto-responder.
            </p>
            <div className="mt-8 flex flex-wrap gap-3" data-rise>
              <Link href="/faq" className="mk-btn mk-btn--ghost">
                Read the FAQ
              </Link>
              <Link href="/signup" className="mk-btn" data-magnetic>
                Start free <Ic name="arrow" size={16} />
              </Link>
            </div>
          </div>
          <div className="mk-card" data-rise>
            <SupportForm initialEmail="" />
          </div>
        </div>
      </section>
      <PageMotion />
    </>
  );
}
