import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Risk Disclosure",
  description:
    "Trading and algo-trading risk disclosure for MyAlgoAgent.",
  path: "/risk-disclosure",
});

const sections: LegalSection[] = [
  {
    id: "trading-risk",
    title: "Trading involves risk",
    body: (
      <Callout tone="gold">
        Trading and algorithmic trading involve substantial risk of loss
        and are not suitable for every investor. You could lose some or
        all of your invested capital. Only trade with money you can
        afford to lose.
      </Callout>
    ),
  },
  {
    id: "past-performance",
    title: "Past and backtested performance",
    paragraphs: [
      "Backtested, simulated and historical performance shown on MyAlgoAgent™ does not guarantee future results. Backtests rely on modeled assumptions (fees, slippage, fills) that may differ from actual market conditions. Forward-testing results reflect simulated orders, not real execution.",
    ],
  },
  {
    id: "forward-testing",
    title: "Forward-test results are hypothetical",
    paragraphs: [
      "Forward testing applies your rules to new market data as it arrives and records the trades they would have taken. No orders are placed and no money is involved. Its results are hypothetical: fills are modelled at candle prices with your fee and slippage assumptions, checked about every 5 minutes during market hours rather than tick by tick, and don't reflect liquidity, order-book depth, rejected orders or the effect of your own orders on the market. A strategy that does well in a forward test can still lose money when traded live.",
    ],
  },
  {
    id: "live-orders",
    title: "Live orders",
    paragraphs: [
      "Live orders are real orders on your own broker account and can lose money. Market orders fill at whatever price is available; limit orders may not fill at all; stop orders can slip past their trigger in fast markets or gaps. Our checks (kill switch, per-order and daily limits, duplicate protection) reduce mistakes but can't prevent losses, and they depend on your broker and our systems being reachable. Your broker's records are the final word on what was ordered and filled — check them, and keep your broker's app available to act directly if needed.",
      "A strategy you take live runs on MyAlgoAgent and sends real orders to your broker automatically whenever its rules trigger — you won't be asked to confirm each one. It checks your rules about once a minute during market hours — not on every price tick — so an order, a stop-loss or a square-off can be up to a minute late and is sent at the market price at that moment, not at the exact candle price your backtest or forward test used; it can miss or delay a signal if your broker session has expired, our systems or your broker are unavailable, or the kill switch is on, and it pauses itself if your broker rejects an order. A live strategy's order size comes from the capital you set, and its position is re-read from your broker's order records before each check. Stopping a live strategy doesn't close an open position — use Exit now, or your broker's app.",
      "Intraday strategies trade on margin: your broker lends buying power, and MyAlgoAgent sizes an intraday live strategy's orders on up to 5 times the capital you set. Borrowed buying power magnifies losses as well as gains — a loss can be larger than the capital you set — and your broker decides the margin it actually requires and can refuse an order it can't cover.",
      "A multi-leg options position is sent as separate orders, one leg at a time (buy legs first). Legs can fill at different moments and prices, and one can be rejected — for example for margin — after others have filled, leaving you with a position you didn't intend. If that happens we cancel the legs still open and show you the ones that filled; we don't close them for you. Margin for sold options is decided by your broker, not by us.",
    ],
  },
  {
    id: "no-advice",
    title: "No investment advice",
    paragraphs: [
      "MyAlgoAgent provides software tools for building, testing and operating trading strategies. Nothing on this platform constitutes personalized investment advice, a recommendation to buy or sell any security, or a guarantee of profit. AI-generated content is informational only.",
      "Your in-app agent is an AI assistant: it explains the platform and trading concepts and can draft strategy rules for you to review, test and decide on yourself. It does not tell you what to buy or sell, does not predict prices or returns, never acts without your confirmation, and — like any AI — can be wrong. Always review what it drafts before using it.",
    ],
  },
  {
    id: "regulatory",
    title: "Regulatory status",
    body: (
      <Callout tone="gold">
        MyAlgoAgent and Shagoon Softech Pvt. Ltd. are not registered as
        a stock broker, investment advisor, portfolio manager or
        research analyst with SEBI or any other regulator. Live trading
        through a connected broker API is subject to applicable Indian
        securities regulations governing algorithmic trading, and it is
        your responsibility — not MyAlgoAgent&rsquo;s — to ensure your
        use of the platform complies with those regulations and with
        your broker&rsquo;s own terms for API-based trading.
      </Callout>
    ),
  },
  {
    id: "technology-risk",
    title: "Technology risk",
    paragraphs: [
      "Software, network, broker-API and market-data outages can affect strategy execution. While the platform includes risk controls and safe-failure behavior, no system can eliminate technology risk entirely.",
      "Broker connections depend on your broker's API: sessions expire every day, and a broker can change, limit or withdraw its API without notice, which can interrupt a connection until you log in again or reconnect.",
      "Voice input is converted to text by speech recognition, which can mishear words, numbers or stock names. Always check what your agent prepared in the review window before confirming it.",
    ],
  },
  {
    id: "options-risk",
    title: "Options",
    paragraphs: [
      "Options are complex and can lose value quickly; buyers can lose the entire premium paid, and sellers can face losses far larger than the premium received — in some positions, unlimited. SEBI's studies found that 9 out of 10 individual traders in equity futures and options incurred net losses. Trading options costs money in brokerage, taxes and the bid–ask spread, and on expiry day prices can move sharply in minutes.",
      "Where live option prices aren't available, the Options Lab's premiums, payoffs and Greeks are model estimates (Black–Scholes) that can differ materially from real prices. Where they are, the chain's prices, IV and Greeks come from the data feed and can be delayed or stale.",
      "Options backtests and options forward tests are hypothetical. Backtests replay real historical option prices minute by minute, but fills are modelled at candle prices with your brokerage and slippage assumptions, P&L is shown at today's lot size, days without a price for every leg are skipped, and a stop-loss or target on the whole position is checked on each minute's closing prices — real fills, liquidity and slippage around expiry can be much worse. Forward tests apply the same rules to live prices, checked about every 5 minutes during market hours; no orders are placed and no money is involved.",
    ],
  },
  {
    id: "demos",
    title: "Demos and illustrations",
    paragraphs: [
      "The strategy builder's demo runs your rules on a short, recent window of data only. Where a replay is labelled an illustration, the price path after the entry is made up to show how your take-profit, stop-loss or trailing stop would behave — it is not a prediction and did not happen. Neither is a substitute for a full backtest, forward testing and your own judgement.",
    ],
  },
  {
    id: "responsibility",
    title: "Your responsibility",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        You are responsible for the strategies you create or enable, the
        risk limits you configure, and the decision to trade with real
        capital. Review this disclosure and our{" "}
        <Link href="/terms" className="text-brand-primary underline">Terms</Link> before using live trading features.
      </p>
    ),
  },
];

export default function RiskDisclosurePage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Risk Disclosure", url: `${siteUrl}/risk-disclosure` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Legal / Risk"
        title="Risk Disclosure"
        updated="September 2026"
        intro="What you should understand about risk before creating a strategy, backtesting it, or connecting real capital."
        sections={sections}
        breadcrumbLabel="Risk Disclosure"
        breadcrumbHref="/risk-disclosure"
      />
    </>
  );
}
