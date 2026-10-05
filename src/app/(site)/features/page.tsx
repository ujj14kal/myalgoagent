import type { Metadata } from "next";
import { Activity, Bell, FlaskConical, Layers, Radio, ShieldCheck, Sparkles, Sigma } from "lucide-react";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag, { ComingSoonList } from "@/components/coming-soon-tag";
import BrokerLogos from "@/components/broker-logos";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "Strategy builder, 46 technical indicators, realistic backtesting, forward testing, risk controls, connections to 9 Indian brokers and an AI agent — and live trading on your own broker, switched on account by account.",
  path: "/features",
});

type Group = {
  title: string;
  icon: typeof Layers;
  items: string[];
  /** Planned, not built yet — shown under a "Coming soon" tag. */
  soon?: string[];
  comingSoon?: boolean;
};

const groups: Group[] = [
  {
    title: "Strategy Builder",
    icon: Layers,
    items: [
      "Step-by-step builder: position, entry, optional exit, risk management — or write the same rules as code",
      "Run on the timeframe you choose — 1m, 3m, 5m, 15m, 30m, 1H, 4H, daily or weekly — with entry and exit times, \"no new entries after\" and an intraday square-off time; intraday positions are never carried overnight",
      "Combine two conditions with Match both / Match any, or build any AND/OR group in advanced mode",
      "Indicator-to-indicator and price-to-indicator comparisons, crossovers and crossunders",
      "Candlestick, chart and volume patterns, each shown with a picture of what it looks like — and candle patterns that only count at a support or resistance level",
      "Stop-loss, take-profit and trailing-stop rules, or up to three staged targets that sell part of the position and lock profit on the rest",
      "Workspaces: connect several of your strategies and your own rules into one plan — AND, OR, in sequence, confirmed by, unless, or only after a prerequisite has held — then publish versions that are backtested, forward tested and traded exactly like any strategy",
      "Swing and long-term strategies: build a position in stages with a multi-level entry plan (a share on the signal, more as price reaches each level), a holding limit, and daily or weekly candle rules that can read a longer trend",
      "Position sizing by quantity, rupee amount, percentage of capital or full capital",
      "Entry orders at market or as a limit order — a % from the signal price or a fixed ₹ price — valid for the day",
      "Intraday or Delivery products: intraday positions are squared off the same day; delivery can be held overnight (long only)",
      "See it in action: a chart of where your strategy would have entered and exited recently, and why — before you save it",
      "Animated trade replay: every condition ticked off on the signal candle, the exact pattern it caught, and the entry, take-profit, stop-loss and trailing-stop lines as the trade plays out",
      "Human-readable strategy summaries",
    ],
    soon: ["MTF (margin) orders, with each broker's own terms", "Risk-per-trade position sizing", "Cooldown periods and maximum trade limits"],
  },
  {
    title: "Technical Indicators",
    icon: Activity,
    items: [
      "46 indicators in total, each with a picture of what it looks like",
      "Moving averages: SMA, EMA, WMA and Hull MA",
      "RSI, MACD, Bollinger Bands, ATR, Standard Deviation",
      "VWAP, ADX/DMI, Stochastic Oscillator, CCI, Williams %R, MFI, Awesome Oscillator, Aroon",
      "ROC/Momentum, OBV, Chaikin Money Flow and other volume-based indicators",
      "Supertrend, Parabolic SAR, Keltner, Donchian and Envelope channels, and pivot points",
      "Automatic support and resistance levels, found from the swing lows and highs price has bounced from",
    ],
  },
  {
    title: "Backtesting & Analytics",
    icon: FlaskConical,
    items: [
      "Configurable date range, timeframe, starting capital, brokerage and slippage",
      "Total return, CAGR, win rate, profit factor, max drawdown, Sharpe ratio, expectancy",
      "Trade-by-trade history with chart markers for entries and exits",
      "Equity curve for every run",
    ],
    soon: ["Sortino ratio", "Drawdown curve and benchmark comparison"],
  },
  {
    title: "Forward Testing & Live Trading",
    icon: Radio,
    items: [
      "Forward testing with notional capital and hypothetical fills on the strategy's own candles — daily or intraday — updated automatically during market hours, with stops and trailing stops closing trades on their own",
      "Broker connections for Dhan, Zerodha, Upstox, Fyers, Angel One, Groww, ICICI Direct, 5paisa and Alice Blue — your own API key, encrypted, verified on connect",
      "A readiness check for each broker — login, static IP, account access and order book — that places no order",
      "Go Live: a tested strategy keeps running on MyAlgoAgent and sends its orders to your broker automatically — intraday or delivery, within your per-order and daily limits — with pause, exit-now, stop and a kill switch. Switched on account by account",
      "Order lifecycle tracking: pending, submitted, filled, rejected, cancelled — with each order's full history",
    ],
    soon: ["Kotak Neo connection", "Position and P&L reconciliation with the connected broker"],
  },
  {
    title: "Risk Management",
    icon: ShieldCheck,
    items: [
      "Maximum loss per session and maximum consecutive losses",
      "Global emergency kill switch, plus pause or stop for any single session",
    ],
    soon: [
      "Maximum daily loss, position size and portfolio exposure limits",
      "Per-strategy capital allocation and maximum trades per day",
      "Broker-disconnect and stale-data safety behavior",
    ],
  },
  {
    title: "Monitoring & Reporting",
    icon: Bell,
    items: [
      "Alerts for signals, fills, stopped sessions and risk-limit breaches",
      "Your real portfolio, orders and positions from your connected broker, in one place",
    ],
    soon: ["Audit logs for authentication, strategy and trading actions", "CSV export of trades and backtest results"],
  },
  {
    title: "Options Lab",
    icon: Sigma,
    items: [
      "Build multi-leg options positions — spreads, straddles, strangles, iron condors and more — from ready-made templates or leg by leg",
      "Payoff chart at expiry and today, net credit or debit, max profit and loss, and exact breakevens",
      "Position Greeks: delta, gamma, theta and vega",
      "Options backtests on real historical option prices, and forward tests on live prices with no orders placed",
      "Send the legs as real orders to your broker after a priced preview — buy legs first, open legs cancelled if one is refused",
    ],
    soon: ["Live option chain with real premiums, IV and open interest for every account"],
  },
  {
    title: "Your AI agent",
    icon: Sparkles,
    items: [
      "Ask anything about trading, indicators, risk or the platform in plain English — it explains and points you to the right page",
      "Talk instead of typing: dictate a message, have any reply read aloud in a natural Indian-English voice, or use hands-free voice mode — with the same rules and review step as typed chat",
      "Describe a strategy and it builds and checks it for you, then opens a review — confirm and it's created",
      "Builds anything the strategy builder can: every indicator, time-of-day windows, candlestick, chart and volume patterns, other timeframes and other stocks — and edits your existing strategies",
      "Prepares backtests, forward tests, loss limits, the kill switch and watchlist changes the same way — you just review and confirm, and it takes you to the result",
      "Answers from your own data: your strategies, backtest results, forward tests and risk settings",
      "Explains why each forward test happened and flags risk events as they occur",
      "Chat in a side panel or full screen, with all your past conversations",
      "Walks you through connecting your broker step by step — and never asks for your keys or passwords in chat",
      "Uses the same validator as the builder, never gives buy or sell calls, and never acts without your confirmation",
    ],
    soon: ["Warns when forward-testing results drift from the backtest", "A daily digest of your sessions"],
  },
];

export default function FeaturesPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Features", url: `${siteUrl}/features` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/features", label: "Features" }]} />
      <PageHeader eyebrow="Features" title="What you can use today — and what’s next" description="Strategy creation, testing and risk control you can use now, with planned features clearly marked as coming soon." />
      <div className="mx-auto max-w-5xl px-4 pt-10">
        <BrokerLogos variant="strip" />
      </div>
      <Reveal>
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-14 pt-8 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="surface surface-interactive p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/[0.08] text-brand-primary">
                <g.icon size={19} />
              </span>
              <div className="mt-4 flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-brand-navy">{g.title}</h2>
                {g.comingSoon && <ComingSoonTag />}
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-brand-navy/70">
                {g.items.map((i2) => (
                  <li key={i2} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-primary/50" />
                    <span>{i2}</span>
                  </li>
                ))}
              </ul>
              {g.soon && <ComingSoonList items={g.soon} />}
            </div>
          ))}
        </div>
      </Reveal>
    </>
  );
}
