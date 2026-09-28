import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag from "@/components/coming-soon-tag";
import BrokerLogos from "@/components/broker-logos";

export const metadata: Metadata = pageMetadata({
  title: "How It Works",
  description:
    "From market data to a live, risk-managed strategy: how MyAlgoAgent takes a trading idea through strategy building, backtesting, forward testing and live execution.",
  path: "/how-it-works",
});

const steps = [
  { title: "1. Market data", text: "Historical and intraday price and volume data for NSE stocks, on every timeframe from 1-minute to daily — the same data your backtests and forward-test trades run on." },
  { title: "2. Strategy creation", text: "Define entry and exit rules using the no-code strategy builder: indicators (including support and resistance levels), candlestick and chart patterns, price/volume conditions, time rules, market or limit orders and position sizing — then watch an animated replay of how it would have traded before you save it. See the Strategy Builder section of Features." },
  { title: "3. Backtesting", text: "Run the strategy against historical data with configurable capital, fees, brokerage and slippage. Backtests are designed to avoid look-ahead bias and future-data leakage." },
  { title: "4. Validation", text: "Review trade-by-trade results, the equity curve, drawdown and performance metrics before trusting a strategy with any capital." },
  { title: "5. Forward testing", text: "Run the validated strategy forward on daily or intraday candles using notional capital only, to see how it behaves on new data before risking money." },
  { title: "6. Risk controls", text: "Set a per-session loss limit, a losing-streak limit and the kill switch. They're enforced by our servers, so they keep protecting you even if you close the app." },
  { title: "7. Broker connection", text: "Connect your own account at Dhan, Zerodha, Upstox, Fyers, Angel One, Groww, ICICI Direct, 5paisa or Alice Blue with your own API key. You log in (or approve the key) on your broker's own site, and the platform verifies the connection before marking it connected." },
  { title: "8. Live execution", text: "With explicit confirmation, the strategy can place real orders through the broker, with the same risk controls active.", soon: true },
];

export default function HowItWorksPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "How It Works", url: `${siteUrl}/how-it-works` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/how-it-works", label: "How It Works" }]} />
      <PageHeader eyebrow="How It Works" title="From idea to live strategy" description="The same eight-step workflow runs every strategy on the platform." />
      <Reveal>
      <Prose>
        {steps.map((s) => (
          <div key={s.title}>
            <h2>
              {s.title}
              {"soon" in s && <ComingSoonTag className="ml-2.5" />}
            </h2>
            <p>{s.text}</p>
            {s.title.startsWith("7.") && (
              <div className="mt-5">
                <BrokerLogos variant="strip" />
              </div>
            )}
          </div>
        ))}
        <h2>Related pages</h2>
        <ul>
          <li><Link href="/backtesting">Backtesting</Link></li>
          <li><Link href="/forward-testing">Forward Testing</Link></li>
          <li><Link href="/live-trading">Live Trading</Link></li>
          <li><Link href="/risk-management">Risk Management</Link></li>
        </ul>
      </Prose>
      </Reveal>
    </>
  );
}
