import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Paper Trading",
  description:
    "Run a strategy against live market data using virtual capital only — no real orders, no real money at risk.",
  alternates: { canonical: `${siteUrl}/paper-trading` },
};

export default function PaperTradingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Paper Trading", url: `${siteUrl}/paper-trading` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/paper-trading", label: "Paper Trading" }]} />
      <PageHeader eyebrow="Paper Trading" title="Test a strategy live, without risking capital" description="Paper trading is a simulated environment that mirrors live trading mechanics using virtual money." />
      <Prose>
        <h2>How it differs from live trading</h2>
        <p>
          Paper trading uses the same strategy engine and the same signals
          as live trading, but every order is simulated against a virtual
          balance. No order is ever sent to a broker, and no real capital is
          ever at risk. The interface clearly labels a paper account as
          simulated at all times.
        </p>

        <h2>What it&rsquo;s for</h2>
        <ul>
          <li>Observing how a strategy behaves against live, moving market data — not just historical data</li>
          <li>Catching implementation issues before committing real capital</li>
          <li>Building confidence in a strategy&rsquo;s risk profile over time</li>
        </ul>

        <h2>What&rsquo;s simulated</h2>
        <ul>
          <li>A configurable virtual starting balance</li>
          <li>Market, limit and stop order simulation, where supported</li>
          <li>Fills using the same fee and slippage assumptions as backtesting</li>
          <li>Virtual positions, P&amp;L and a full paper trade history</li>
        </ul>

        <h2>Controls</h2>
        <p>
          Paper strategies can be started, paused and stopped independently
          of live strategies, and a paper account can be reset with explicit
          confirmation — useful when starting a fresh evaluation period.
        </p>
      </Prose>
    </>
  );
}
