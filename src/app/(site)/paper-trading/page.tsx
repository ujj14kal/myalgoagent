import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag from "@/components/coming-soon-tag";

export const metadata: Metadata = pageMetadata({
  title: "Paper Trading",
  description:
    "Run a strategy forward on end-of-day market data using virtual capital only — no real orders, no real money at risk.",
  path: "/paper-trading",
});

export default function PaperTradingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Paper Trading", url: `${siteUrl}/paper-trading` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/paper-trading", label: "Paper Trading" }]} />
      <PageHeader eyebrow="Paper Trading" title="Test a strategy forward, without risking capital" description="Paper trading is a simulated environment that mirrors live trading mechanics using virtual money." />
      <Reveal>
      <Prose>
        <h2>How it differs from live trading</h2>
        <p>
          Paper trading uses the same strategy engine and signals as
          backtesting, run forward on end-of-day data each time you sync,
          and every order is simulated against a virtual balance. No order is ever sent to a broker, and no real capital is
          ever at risk. The interface clearly labels a paper account as
          simulated at all times.
        </p>

        <h2>What it&rsquo;s for</h2>
        <ul>
          <li>Observing how a strategy behaves on new market data as it arrives — not just historical data</li>
          <li>Catching implementation issues before committing real capital</li>
          <li>Building confidence in a strategy&rsquo;s risk profile over time</li>
        </ul>

        <h2>What&rsquo;s simulated</h2>
        <ul>
          <li>A configurable virtual starting balance</li>
          <li>Simulated fills, with stop-loss, target and trailing-stop exits</li>
          <li>Fills using the same fee and slippage assumptions as backtesting</li>
          <li>Virtual positions, P&amp;L and a full paper trade history</li>
        </ul>
        <p>
          <ComingSoonTag /> Limit-order simulation and intraday updates.
        </p>

        <h2>Controls</h2>
        <p>
          Each paper session can be started, paused and stopped on its own,
          and you can start a fresh session at any time for a new
          evaluation period.
        </p>
      </Prose>
      </Reveal>
    </>
  );
}
