import { ALL_BROKERS_SENTENCE } from "@/lib/brokers/public-copy";
import type { Metadata } from "next";
import Link from "next/link";
import BrokerLogos from "@/components/broker-logos";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Product Overview — What MyAlgoAgent Does",
  description:
    "A plain-language overview of MyAlgoAgent: an algo-trading software platform covering strategy building, backtesting, forward testing and risk management, with live trading on your own broker account, switched on account by account.",
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
      "MyAlgoAgent lets a user connect market data, define entry and exit rules using technical indicators and price conditions, simulate that strategy against historical data, validate it in a risk-free forward-testing mode, and — only with explicit authorization and a connected broker account — run it against live markets with configurable risk limits.",
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
      "Market data → strategy creation → backtesting → validation → forward testing → risk controls → broker connection → live execution. Each stage is a distinct, explicit step; the platform never moves a strategy into live trading automatically.",
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
    id: "forward-testing",
    title: "Forward testing",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        Forward testing runs a strategy forward on its own candles — daily or
        intraday, from 1-minute to 4-hour — using notional capital only. No real orders are placed and no real money
        is at risk. It exists to validate a strategy&rsquo;s live behavior
        before any capital is committed. See{" "}
        <Link href="/forward-testing" className="text-brand-primary underline">Forward Testing</Link>.
      </p>
    ),
  },
  {
    id: "live-trading",
    title: "Broker connections & live trading",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        Users can connect their own account at {ALL_BROKERS_SENTENCE} today,
        through the broker&rsquo;s official API, with their API keys
        encrypted on our servers. Live order placement is switched on
        account by account: a tested strategy keeps running on
        MyAlgoAgent and sends its orders to the user&rsquo;s broker from the
        account&rsquo;s own static IP, after a readiness check and an
        explicit risk acknowledgement, with every order checked against the
        user&rsquo;s limits and a kill switch. The platform does not custody
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
    id: "market-data",
    title: "Market data, charts and Analyst Pro",
    paragraphs: [
      "Every NSE-listed stock and the main BSE stocks, plus NIFTY 50, NIFTY Bank, NIFTY IT and SENSEX, with interactive candlestick charts from 1 minute to 1 month, indicator overlays, your own custom indicators and drawing tools. Backtests and forward tests use prices from the user's own broker account when it supplies data, and every page says which source it used.",
      "Analyst Pro reads any stock's daily chart through standard trend, momentum, volume and volatility indicators and shows each one's reading and weight, with the nearest support and resistance. It is an analysis of the data, not a forecast and not advice.",
    ],
  },
  {
    id: "workspace",
    title: "Blocks, concepts and trading systems",
    paragraphs: [
      "A three-layer workspace for rules that go beyond a simple indicator: define a market idea once as a block (your own BOS, FVG or order block), combine blocks into bullish or bearish concepts (all together, in sequence, confirmed, vetoed), and assemble concepts into a trading system with its own instrument, sessions, sizing, risk and conflict rules. Published versions never change under a running trade.",
    ],
  },
  {
    id: "options-lab",
    title: "Options Lab",
    paragraphs: [
      "A calculator for multi-leg options positions: pick a ready-made strategy (spreads, straddles, strangles, iron condors and more) or build it leg by leg, and see the payoff at expiry and today, net credit or debit, maximum profit and loss, exact breakevens and the position's Greeks — before trading it. Premiums are Black–Scholes estimates you can overwrite until a live option chain is connected.",
    ],
    soon: ["Option chains from more brokers (Zerodha, Angel One, Fyers, 5paisa)"],
  },
  {
    id: "risk-management",
    title: "Risk management",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        A per-session loss limit, a consecutive-loss limit and a global
        kill switch are enforced on the server, independently of the user
        interface, so a session can be stopped even if you are offline.
        Per-strategy daily-loss and drawdown limits stop new entries once reached; position-size and exposure limits are coming soon. See{" "}
        <Link href="/risk-management" className="text-brand-primary underline">Risk Management</Link>.
      </p>
    ),
  },
  {
    id: "monitoring",
    title: "Alerts, portfolio monitoring, order tracking and reporting",
    paragraphs: [
      "Users receive alerts for signals, fills and risk-limit breaches, see their real holdings, positions and orders from their connected broker, and review each forward test's hypothetical trades inside that forward test.",
    ],
    soon: ["Alerts for rejected broker orders", "CSV exports for further analysis"],
  },
  {
    id: "ai",
    title: "AI functionality",
    paragraphs: [
      "Every account has its own AI agent, named by the user. It explains the platform and trading concepts, answers from the user's own strategies and results, and prepares strategies, backtests, forward tests and risk settings that the user reviews and confirms in one step. It can build anything the visual builder can — including time-of-day windows, candlestick, chart and volume patterns, other timeframes and other stocks — and edit existing strategies. It also explains why each forward test happened and flags risk events. It runs on Amazon Bedrock, never places trades or changes anything on its own, and its output is informational only — never a guarantee of future performance or personalized financial advice.",
      "Users can type or talk: dictate a message, hear replies read aloud in a natural Indian-English voice, or use a hands-free voice mode that keeps the conversation going. The microphone is only on while it's in use, and audio isn't stored. Spoken requests follow exactly the same rules as typed ones: anything the agent prepares still opens a review window for the user to confirm.",
    ],
    soon: ["Flagging signs of possible overfitting in backtest results", "Warning when forward-testing results drift from the backtest"],
  },
  {
    id: "plans",
    title: "Plans, credits and billing",
    paragraphs: [
      "Every new account starts with a 7-day free trial of the paid features, with no card needed, then continues on Free unless the user upgrades to Trade or Pro. Prices are before 18% GST, which is added at checkout and itemised; payment is through Razorpay by UPI, card or netbanking, and every payment gets a numbered invoice. Credits pay for the AI, voice and backtests, with a live meter and the price of each action shown before it is used. See Pricing for the details.",
    ],
  },
  {
    id: "support",
    title: "Support",
    paragraphs: [
      "Requests made in the app or by replying to any of our emails become numbered support cases that a person on the team answers, with the reply in the app and in the user's inbox. Refunds, where our policy allows them, are reviewed and approved by that team.",
    ],
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
      "MyAlgoAgent is live and still growing. Strategy building, backtesting, forward testing, risk controls, broker connections, the AI agent and billing are available today; live trading is switched on account by account, and anything not yet available is marked Coming soon on these pages.",
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
        updated="October 2026"
        intro="A software platform that helps traders and developers build, test and run rule-based trading strategies. Not a financial advisor — it does not manage money on a user's behalf without explicit, user-initiated broker connections."
        sections={sections}
        breadcrumbLabel="Product Overview"
        breadcrumbHref="/product"
      />
    </>
  );
}
