import type { Metadata } from "next";
import Link from "next/link";
import BrokerLogos from "@/components/broker-logos";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Product Overview — What MyAlgoAgent Does",
  description:
    "A plain-language overview of MyAlgoAgent: an algo-trading software platform covering strategy building, backtesting, paper trading and risk management, with live broker execution coming soon.",
  path: "/product",
});

const sections: LegalSection[] = [
  {
    id: "what-is-algo",
    title: "What is algo trading?",
    paragraphs: [
      "Algorithmic (“algo”) trading means expressing a trading idea as an explicit, repeatable set of rules — for example, buy when a fast moving average crosses above a slow one, and sell when a stop-loss or target is hit — and having software evaluate and, optionally, execute those rules instead of a human deciding trade by trade in real time.",
    ],
  },
  {
    id: "what-it-does",
    title: "What our platform does",
    paragraphs: [
      "MyAlgoAgent lets a user connect market data, define entry and exit rules using technical indicators and price conditions, simulate that strategy against historical data, validate it in a risk-free paper-trading mode, and — only with explicit authorization and a connected broker account — run it against live markets with configurable risk limits.",
    ],
  },
  {
    id: "who-for",
    title: "Who it is for",
    bullets: [
      "Individual traders who want to systematize a trading idea instead of trading on discretion alone.",
      "Developers and quantitative researchers who want a structured environment for strategy iteration.",
      "Anyone who wants to test a trading idea against history before risking capital on it.",
    ],
  },
  {
    id: "workflow",
    title: "The complete workflow",
    paragraphs: [
      "Market data → strategy creation → backtesting → validation → paper trading → risk controls → broker connection → live execution. Each stage is a distinct, explicit step; the platform never moves a strategy into live trading automatically.",
    ],
  },
  {
    id: "strategy-builder",
    title: "Strategy builder",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        A step-by-step, no-code builder — position, entry, optional exit
        and risk management — for composing conditions from technical
        indicators (moving averages, RSI, MACD, Bollinger Bands, VWAP, ATR,
        support and resistance levels and others), candlestick, chart and
        volume patterns, price action and time-based rules, combined with
        AND/OR logic — or write the same rules as simple code. Strategies run on the timeframe you choose, from
        1-minute to daily, with market or limit entry orders and intraday
        time rules. Before saving, a demo shows where the strategy would
        have entered and exited on recent data, with an animated replay of
        a trade — each condition ticked off, and the entry, take-profit,
        stop-loss and trailing-stop lines as it plays out. See{" "}
        <Link href="/features" className="text-brand-primary underline">Features</Link>.
      </p>
    ),
  },
  {
    id: "backtesting-engine",
    title: "Backtesting engine",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        Strategies are simulated against historical price data with
        configurable capital, brokerage, fees and a slippage model, so
        results reflect realistic execution rather than a simplified
        price-only calculation. See{" "}
        <Link href="/backtesting" className="text-brand-primary underline">Backtesting</Link>.
      </p>
    ),
  },
  {
    id: "paper-trading",
    title: "Paper trading",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        Paper trading runs a strategy forward on its own candles — daily or
        intraday, from 1-minute to 4-hour — using virtual capital only. No real orders are placed and no real money
        is at risk. It exists to validate a strategy&rsquo;s live behavior
        before any capital is committed. See{" "}
        <Link href="/paper-trading" className="text-brand-primary underline">Paper Trading</Link>.
      </p>
    ),
  },
  {
    id: "live-trading",
    title: "Broker connections & live trading",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        Users can connect their own account at Dhan, Zerodha, Upstox,
        Fyers, Angel One, Groww, ICICI Direct, 5paisa or Alice Blue today,
        through the broker&rsquo;s official API, with their API keys
        encrypted on our servers. Live order placement is coming soon: it
        will require that connection plus confirmed risk settings before
        any strategy can place real orders. The platform does not custody
        funds; it connects to broker APIs on the user&rsquo;s behalf. See{" "}
        <Link href="/live-trading" className="text-brand-primary underline">Live Trading</Link>.
      </p>
    ),
    extra: (
      <div className="mt-5">
        <BrokerLogos variant="strip" />
      </div>
    ),
  },
  {
    id: "options-lab",
    title: "Options Lab",
    paragraphs: [
      "A calculator for multi-leg options positions: pick a ready-made strategy (spreads, straddles, strangles, iron condors and more) or build it leg by leg, and see the payoff at expiry and today, net credit or debit, maximum profit and loss, exact breakevens and the position's Greeks — before trading it. Premiums are Black–Scholes estimates you can overwrite until a live option chain is connected.",
    ],
    soon: ["Live option chain with real premiums, IV and open interest", "Options backtesting and paper trading"],
  },
  {
    id: "risk-management",
    title: "Risk management",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        A per-session loss limit, a consecutive-loss limit and a global
        kill switch are enforced on the server, independently of the user
        interface, so a session can be stopped even if you are offline.
        Daily loss, position-size and exposure limits are coming soon. See{" "}
        <Link href="/risk-management" className="text-brand-primary underline">Risk Management</Link>.
      </p>
    ),
  },
  {
    id: "monitoring",
    title: "Alerts, portfolio monitoring, order tracking and reporting",
    paragraphs: [
      "Users receive alerts for signals, fills and risk-limit breaches, and can review positions, P&L, orders and a full trade history.",
    ],
    soon: ["Alerts for rejected broker orders", "CSV exports for further analysis"],
  },
  {
    id: "ai",
    title: "AI functionality",
    paragraphs: [
      "Every account has its own AI agent, named by the user. It explains the platform and trading concepts, answers from the user's own strategies and results, and prepares strategies, backtests, paper sessions and risk settings that the user reviews and confirms in one step. It can build anything the visual builder can — including time-of-day windows, candlestick, chart and volume patterns, other timeframes and other stocks — and edit existing strategies. It also explains why each paper trade happened and flags risk events. It runs on Amazon Bedrock, never places trades or changes anything on its own, and its output is informational only — never a guarantee of future performance or personalized financial advice.",
      "Users can type or talk: dictate a message, hear replies read aloud in a natural Indian-English voice, or use a hands-free voice mode that keeps the conversation going. The microphone is only on while it's in use, and audio isn't stored. Spoken requests follow exactly the same rules as typed ones: anything the agent prepares still opens a review window for the user to confirm.",
    ],
    soon: ["Flagging signs of possible overfitting in backtest results", "Warning when paper-trading results drift from the backtest"],
  },
  {
    id: "disclosure",
    title: "Important disclosure",
    body: (
      <Callout tone="gold">
        Historical and backtested performance does not guarantee future
        results. MyAlgoAgent is software infrastructure for building
        and operating trading strategies; it is not a broker-dealer,
        investment advisor, or provider of personalized investment advice.
        Read the full <Link href="/risk-disclosure" className="underline">Risk Disclosure</Link>.
      </Callout>
    ),
  },
  {
    id: "stage",
    title: "Product stage",
    paragraphs: [
      "MyAlgoAgent is in active development. Public marketing and documentation pages describe the target product architecture; features are being built out in stages, starting with the strategy, backtesting and risk-management core described above.",
    ],
  },
];

export default function ProductPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Product Overview", url: `${siteUrl}/product` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Overview"
        title="What MyAlgoAgent does"
        updated="September 2026"
        intro="A software platform that helps traders and developers build, test and run rule-based trading strategies. Not a financial advisor — it does not manage money on a user's behalf without explicit, user-initiated broker connections."
        sections={sections}
        breadcrumbLabel="Product Overview"
        breadcrumbHref="/product"
      />
    </>
  );
}
