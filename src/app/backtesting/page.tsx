import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Backtesting Engine",
  description:
    "Realistic strategy backtesting with configurable fees, brokerage and slippage, look-ahead bias prevention, and a full set of performance metrics.",
  alternates: { canonical: `${siteUrl}/backtesting` },
};

export default function BacktestingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Backtesting", url: `${siteUrl}/backtesting` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/backtesting", label: "Backtesting" }]} />
      <PageHeader eyebrow="Backtesting" title="Realistic backtesting, not just raw price math" description="Backtests are built to reflect what a strategy would actually have cost and earned — not an idealized, frictionless simulation." />
      <Prose>
        <h2>What&rsquo;s configurable</h2>
        <ul>
          <li>Instrument(s), strategy, timeframe and historical period</li>
          <li>Starting capital and position-sizing rules</li>
          <li>Brokerage, transaction fees, taxes/levies where applicable</li>
          <li>A slippage model and spread assumptions</li>
          <li>Margin/leverage rules where applicable</li>
        </ul>

        <h2>Why it matters</h2>
        <p>
          A backtest that ignores fees, slippage and realistic fills will
          overstate performance. my ALGO agent&rsquo;s backtesting engine
          applies the same cost assumptions a live strategy would face, so
          results are a more honest estimate of what actually happened.
        </p>

        <h2>Bias prevention</h2>
        <ul>
          <li>No look-ahead bias — a strategy can only act on data available at that point in time</li>
          <li>No future-data leakage into indicator calculations</li>
          <li>Correct handling of indicator warm-up periods</li>
          <li>Trading-session and calendar awareness</li>
          <li>Explicit handling of missing or invalid market data</li>
        </ul>

        <h2>Metrics reported</h2>
        <ul>
          <li>Total return, absolute P&amp;L, CAGR where meaningful</li>
          <li>Win rate, loss rate, profit factor, expectancy</li>
          <li>Maximum drawdown, average drawdown, recovery factor</li>
          <li>Sharpe, Sortino and Calmar ratios, volatility</li>
          <li>Trade count, average holding period, largest win/loss</li>
          <li>Monthly/yearly returns and performance by instrument</li>
        </ul>

        <h2>Reproducibility</h2>
        <p>
          Every backtest stores its exact configuration alongside its
          results, so results can be reproduced and audited later — an
          important property when a strategy graduates to paper or live
          trading.
        </p>

        <h2>Important disclosure</h2>
        <p>
          A backtest describes how a strategy would have performed on
          historical data under the modeled assumptions. It is not a
          guarantee of future performance. Markets change, and live
          execution can differ from simulated fills.
        </p>
      </Prose>
    </>
  );
}
