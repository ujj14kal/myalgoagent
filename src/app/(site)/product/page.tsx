import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose, Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = {
  title: "Product Overview — What MyAlgoAgent Does",
  description:
    "A plain-language overview of MyAlgoAgent: an algo-trading software platform covering strategy building, backtesting, paper trading, live broker execution and risk management.",
  alternates: { canonical: `${siteUrl}/product` },
};

export default function ProductPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Product Overview", url: `${siteUrl}/product` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/product", label: "Product Overview" }]} />
      <PageHeader
        eyebrow="Product Overview"
        title="MyAlgoAgent — Algo Trading Platform"
        description="MyAlgoAgent is a software platform that helps traders and developers build, test and run rule-based trading strategies. It is not a financial advisor and does not manage money on a user's behalf without explicit, user-initiated broker connections."
      />
      <Reveal>
      <Prose>
        <h2>What is algo trading?</h2>
        <p>
          Algorithmic (&ldquo;algo&rdquo;) trading means expressing a trading
          idea as an explicit, repeatable set of rules — for example, buy
          when a fast moving average crosses above a slow one, and sell when
          a stop-loss or target is hit — and having software evaluate and,
          optionally, execute those rules instead of a human deciding trade
          by trade in real time.
        </p>

        <h2>What our platform does</h2>
        <p>
          MyAlgoAgent lets a user connect market data, define entry and
          exit rules using technical indicators and price conditions,
          simulate that strategy against historical data, validate it in a
          risk-free paper-trading mode, and — only with explicit
          authorization and a connected broker account — run it against live
          markets with configurable risk limits.
        </p>

        <h2>Who it is for</h2>
        <ul>
          <li>Individual traders who want to systematize a trading idea instead of trading on discretion alone.</li>
          <li>Developers and quantitative researchers who want a structured environment for strategy iteration.</li>
          <li>Anyone who wants to test a trading idea against history before risking capital on it.</li>
        </ul>

        <h2>The complete workflow</h2>
        <p>
          Market data → strategy creation → backtesting → validation → paper
          trading → risk controls → broker connection → live execution.
          Each stage is a distinct, explicit step; the platform never moves
          a strategy into live trading automatically.
        </p>

        <h3>Strategy builder</h3>
        <p>
          A no-code interface for composing entry and exit conditions from
          technical indicators (moving averages, RSI, MACD, Bollinger
          Bands, VWAP, ATR and others), price action, volume and time-based
          rules, combined with AND/OR logic. See{" "}
          <Link href="/features">Features</Link>.
        </p>

        <h3>Backtesting engine</h3>
        <p>
          Strategies are simulated against historical price data with
          configurable capital, brokerage, fees and a slippage model, so
          results reflect realistic execution rather than a simplified
          price-only calculation. See <Link href="/backtesting">Backtesting</Link>.
        </p>

        <h3>Paper trading</h3>
        <p>
          Paper trading runs a strategy against current market data using
          virtual capital only. No real orders are placed and no real money
          is at risk. It exists to validate a strategy&rsquo;s live behavior
          before any capital is committed. See{" "}
          <Link href="/paper-trading">Paper Trading</Link>.
        </p>

        <h3>Live trading &amp; broker integration</h3>
        <p>
          Live trading requires the user to explicitly connect a supported
          broker account and confirm risk settings before any strategy can
          place real orders. The platform does not custody funds; it
          connects to broker APIs on the user&rsquo;s behalf, with
          credentials handled through secure secret management rather than
          stored in application code. See{" "}
          <Link href="/live-trading">Live Trading</Link>.
        </p>

        <h3>Risk management</h3>
        <p>
          Configurable daily loss limits, maximum position size, maximum
          exposure and a global kill switch are enforced independently of
          the user interface, so a strategy can be stopped even if a client
          is offline or unresponsive. See{" "}
          <Link href="/risk-management">Risk Management</Link>.
        </p>

        <h3>Alerts, portfolio monitoring, order tracking and reporting</h3>
        <p>
          Users receive alerts for signals, fills, rejected orders and
          risk-limit breaches, and can review positions, P&amp;L, open
          orders and a full trade history, with exports for further
          analysis.
        </p>

        <h3>AI functionality</h3>
        <p>
          Where implemented, AI features assist with translating a
          natural-language strategy description into explicit rules,
          summarizing backtest results and flagging signs of possible
          overfitting. AI output is informational only — never a guarantee
          of future performance or personalized financial advice.
        </p>

        <h2>Important disclosure</h2>
        <Callout tone="gold">
          Historical and backtested performance does not guarantee future
          results. MyAlgoAgent is software infrastructure for building
          and operating trading strategies; it is not a broker-dealer,
          investment advisor, or provider of personalized investment advice.
          Read the full <Link href="/risk-disclosure">Risk Disclosure</Link>.
        </Callout>

        <h2>Product stage</h2>
        <p>
          MyAlgoAgent is in active development. Public marketing and
          documentation pages describe the target product architecture;
          features are being built out in stages, starting with the
          strategy, backtesting and risk-management core described above.
        </p>

        <h2>Learn more</h2>
        <ul>
          <li><Link href="/technology">Technology &amp; AWS Infrastructure</Link></li>
          <li><Link href="/security">Security</Link></li>
          <li><Link href="/faq">FAQ</Link></li>
          <li><Link href="/privacy-policy">Privacy Policy</Link></li>
          <li><Link href="/terms">Terms</Link></li>
          <li><Link href="/risk-disclosure">Risk Disclosure</Link></li>
          <li><Link href="/contact">Contact</Link></li>
        </ul>
      </Prose>
      </Reveal>
    </>
  );
}
