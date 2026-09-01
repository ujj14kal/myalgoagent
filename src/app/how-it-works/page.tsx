import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From market data to a live, risk-managed strategy: how my ALGO agent takes a trading idea through strategy building, backtesting, paper trading and live execution.",
  alternates: { canonical: `${siteUrl}/how-it-works` },
};

const steps = [
  { title: "1. Market data", text: "The platform pulls historical and near-real-time OHLCV data for supported instruments through a data-provider abstraction, so the trading engine is not tied to one provider." },
  { title: "2. Strategy creation", text: "Define entry and exit rules using the no-code strategy builder: indicators, price/volume conditions, time rules and position sizing. See the Strategy Builder section of Features." },
  { title: "3. Backtesting", text: "Run the strategy against historical data with configurable capital, fees, brokerage and slippage. Backtests are designed to avoid look-ahead bias and future-data leakage." },
  { title: "4. Validation", text: "Review trade-by-trade results, the equity curve, drawdown and performance metrics before trusting a strategy with any capital." },
  { title: "5. Paper trading", text: "Run the validated strategy against live market data using virtual capital only, to see how it behaves in real time before risking money." },
  { title: "6. Risk controls", text: "Set daily loss limits, position caps, exposure limits and the kill switch. These are enforced server-side, independent of the UI." },
  { title: "7. Broker connection", text: "Connect a supported broker account. The platform tests the connection and synchronizes account state before enabling live trading." },
  { title: "8. Live execution", text: "With explicit confirmation, the strategy can place real orders through the broker, with the same risk controls active." },
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
      <Prose>
        {steps.map((s) => (
          <div key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </div>
        ))}
        <h2>Related pages</h2>
        <ul>
          <li><Link href="/backtesting">Backtesting</Link></li>
          <li><Link href="/paper-trading">Paper Trading</Link></li>
          <li><Link href="/live-trading">Live Trading</Link></li>
          <li><Link href="/risk-management">Risk Management</Link></li>
        </ul>
      </Prose>
    </>
  );
}
