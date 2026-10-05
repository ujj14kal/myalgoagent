import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = pageMetadata({
  title: "Forward Testing",
  description:
    "Validate a strategy on new market data as it arrives: the hypothetical trades its rules would take, on daily or intraday candles — no orders, no money involved.",
  path: "/forward-testing",
});

export default function ForwardTestingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Forward Testing", url: `${siteUrl}/forward-testing` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHeader crumbs={[{ href: "/", label: "Home" }, { href: "/forward-testing", label: "Forward Testing" }]} eyebrow="Forward Testing" title="See how a strategy holds up on new market data" description="Forward testing runs your strategy on market data as it arrives and records the trades its rules would have taken — so you can validate it before any real order is placed." />
      <Reveal>
      <Prose>
        <h2>What forward testing is</h2>
        <p>
          A backtest shows how rules would have behaved in the past. Forward testing
          keeps applying the same rules, with the same engine, to new candles as the
          market moves — daily or intraday — and records each hypothetical trade with
          the rule that caused it. No order is ever sent to a broker and no money is
          involved: it&rsquo;s a strategy-validation tool, not a trading account, game or
          contest, and every result is labelled hypothetical.
        </p>

        <h2>What it&rsquo;s for</h2>
        <ul>
          <li>Checking a strategy on data it has never seen, not just the history it was built on</li>
          <li>Spotting when results drift from what the backtest suggested</li>
          <li>Catching rule or setup mistakes before connecting a broker for live trading</li>
        </ul>

        <h2>What it models</h2>
        <ul>
          <li>A notional capital you choose, used only to size hypothetical trades</li>
          <li>Hypothetical fills with the same fee and slippage assumptions as backtesting</li>
          <li>Stop-loss, target and trailing-stop exits — checked automatically about every 5 minutes during market hours</li>
          <li>Limit entries (a % from the signal price or a fixed ₹ price) that rest until they fill or the day ends</li>
          <li>Intraday rules on 1m to 4H candles, with entry and exit times, &ldquo;no new entries after&rdquo; and an automatic square-off</li>
          <li>Every hypothetical trade explained: the rule that fired, the exit reason and the price</li>
        </ul>
        <p>
          Hypothetical results have real limits: they assume fills at modelled prices, ignore
          liquidity and order-book effects, and don&rsquo;t guarantee how the strategy will
          perform live. See our <a href="/risk-disclosure">Risk Disclosure</a>.
        </p>

        <h2>Controls</h2>
        <p>
          Each forward test can be paused, resumed or stopped on its own, and you can start
          a fresh one at any time for a new evaluation period. Press Sync to catch up
          immediately; otherwise it keeps itself up to date during market hours.
        </p>
      </Prose>
      </Reveal>
    </>
  );
}
