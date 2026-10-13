import type { Metadata } from "next";
import { Activity, Bell, Coins, FlaskConical, Gauge, LifeBuoy, Layers, Radio, ShieldCheck, Sparkles, Sigma } from "lucide-react";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag, { ComingSoonList } from "@/components/coming-soon-tag";
import { ALL_BROKERS_SENTENCE, BROKER_COUNT } from "@/lib/brokers/public-copy";
import { INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import { PRESETS } from "@/lib/strategy/presets";
import BrokerLogos from "@/components/broker-logos";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    `Strategy builder, ${INDICATOR_CATALOG.length} technical indicators and levels, realistic backtesting, forward testing, risk controls, connections to ${BROKER_COUNT} Indian brokers and an AI agent — and live trading on your own broker, switched on account by account.`,
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
      "Candlestick, chart and volume patterns, each shown with a picture of what it looks like — and candle and chart patterns that only count at a support or resistance level",
      "Stop-loss, take-profit and trailing-stop rules, or up to three staged targets that sell part of the position and lock profit on the rest, including targets at Fibonacci extensions of the swing in force when you enter (backtests and forward tests)",
      "Workspace in three layers: define blocks (My BOS, My FVG, an order block, a level, a session), combine them into bullish or bearish concepts — all at once, in sequence, confirmed by, unless, or only after a prerequisite has held — then assemble concepts into a trading system with your instrument, sessions, capital, sizing, leverage, multi-target exits, conflict and reversal rules. Published versions are backtested, forward tested and traded like any strategy",
      "Swing strategies (held for days to weeks): build a position in stages with a multi-level entry plan (a share on the signal, more as price reaches each level), a holding limit, and daily or weekly candle rules that can read a longer trend",
      "Position sizing by quantity, rupee amount, percentage of capital, full capital, or the amount you're willing to risk per trade (set by your stop-loss distance)",
      "Entry orders at market or as a limit order — a % from the signal price or a fixed ₹ price — valid for the day",
      "Intraday or Delivery products: intraday positions are squared off the same day; delivery can be held overnight (long only)",
      "See it in action: a chart of where your strategy would have entered and exited recently, and why — before you save it",
      "Animated trade replay: every condition ticked off on the signal candle, the exact pattern it caught, and the entry, take-profit, stop-loss and trailing-stop lines as the trade plays out",
      "Human-readable strategy summaries",
    ],
    soon: ["MTF (margin) orders, with each broker's own terms", "Cooldown periods and maximum trade limits"],
  },
  {
    title: "Technical Indicators",
    icon: Activity,
    items: [
      `${INDICATOR_CATALOG.length} indicators and levels in total, each with a picture of what it looks like`,
      "Bollinger Bands with %B, BandWidth and two kinds of squeeze (narrowest bands of the last N candles, or Bollinger inside Keltner)",
      "VWAP that restarts every trading session, with one and two standard-deviation bands — made for intraday candles",
      "Fibonacci retracement and extension levels drawn from the latest confirmed swing (no repainting), with a golden-zone flag and the swing direction",
      `${PRESETS.length} ready-made recipes from classic RSI, MACD, Bollinger, VWAP and Fibonacci setups, each opening as an ordinary strategy you can read rule by rule, change and backtest`,
      "Divergence flags for RSI and MACD (confirmed a few candles after the second swing, so never early), Bollinger W-bottom and M-top, PPO, and a source or smoothing choice on RSI, MACD and Bollinger",
      "Opening-range high and low (first 15 minutes), Fibonacci fan and time-zone drawings, and harmonic patterns (Gartley, Bat, Butterfly, Crab, bullish and bearish) among the chart patterns",
      "Anchored VWAPs: weekly, monthly, from any date, or from the latest swing low or high; Fibonacci clusters, swing age and swings you type in yourself",
      "Momentum helpers: RSI change, MACD histogram change and band slope over N candles, so rules can say \"turning up\" or \"building for three bars\"",
      "Moving averages: SMA, EMA, WMA and Hull MA",
      "RSI, MACD, Bollinger Bands, ATR, Standard Deviation",
      "VWAP, ADX/DMI, Stochastic Oscillator, CCI, Williams %R, MFI, Awesome Oscillator, Aroon",
      "ROC/Momentum, OBV, Chaikin Money Flow and other volume-based indicators",
      "Supertrend, Parabolic SAR, Keltner, Donchian and Envelope channels, and pivot points",
      "Automatic support and resistance levels, found from the swing lows and highs price has bounced from",
      "Your own custom indicators, always shown with their full definition: graph lines and price overlays from a formula, signal markers, horizontal levels, zones and rectangles, channels and bands — described to your AI agent in plain words, which builds a strategy around them and opens it in the full builder for you to preview, replay and save",
      "Rules can read any line of a zone, channel or band — upper, middle, lower — or whether price is inside it; drawings never use bars from before you could have drawn them",
    ],
  },
  {
    title: "Backtesting & Analytics",
    icon: FlaskConical,
    items: [
      "Configurable date range, timeframe, starting capital, brokerage and slippage",
      "Total return, CAGR, win rate, profit factor, max drawdown, Sharpe ratio, expectancy",
      "Trade-by-trade history with chart markers for entries and exits",
      "Equity curve and a drawdown curve for every run",
      "Day-by-day calendar of winning and losing days, monthly returns, streaks, best and worst day and a spread of trade results",
      "Backtest several strategies together and see one combined account value, each strategy's contribution and every trade",
      "Up to five years of history on short timeframes when your own broker supplies the data",
    ],
    soon: ["Sortino ratio", "Benchmark comparison"],
  },
  {
    title: "Forward Testing & Live Trading",
    icon: Radio,
    items: [
      "Forward testing with notional capital and hypothetical fills on the strategy's own candles — daily or intraday — updated automatically during market hours, with stops and trailing stops closing trades on their own",
      `Broker connections for ${ALL_BROKERS_SENTENCE} — your own API key, encrypted, verified on connect (${BROKER_COUNT} brokers in all)`,
      "Quicker daily logins where the broker allows it: Groww signs in automatically with its API TOTP key, Upstox needs only a tap in its app or on WhatsApp, and Dhan and Angel One offer an optional automatic login (beta) that you switch on yourself after reading what it stores. A morning reminder tells you if a session is missing before the market opens",
      "A readiness check for each broker — login, static IP, account access and order book — that places no order",
      "Go Live: a tested strategy keeps running on MyAlgoAgent and sends its orders to your broker automatically — intraday or delivery, within your per-order and daily limits — with pause, exit-now, stop and a kill switch. Switched on account by account",
      "Optional VWAP-style entry slicing at Go Live: a large entry goes out in 3, 5 or 8 slices through the session, more of them when the market is busiest; exits always go out at once and the slices stop the moment the position closes",
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
      "Per-strategy maximum daily loss and maximum drawdown: once reached, no new positions open (existing ones still exit by their rules)",
      "Stop-loss and target in points or percent, measured on the share price or on your capital (a % of capital or a rupee amount won or lost), plus — in trading systems — intraday leverage with a worked example showing entry, stop and target prices, margin used, leveraged exposure, ₹ P&L and % on margin",
      "Targets as risk/reward multiples (1:2 = 2R), a break-even stop, and per-target stop rules: after TP1 move the stop to breakeven, after TP2 to TP1, trail by points, % or ATR, keep it, or set your own distance",
    ],
    soon: [
      "Position size and portfolio exposure limits across strategies",
      "Per-strategy capital allocation and maximum trades per day",
      "Broker-disconnect and stale-data safety behavior",
    ],
  },
  {
    title: "Market Data & Charts",
    icon: Activity,
    items: [
      "Every NSE-listed stock and the main BSE stocks, plus NIFTY 50, NIFTY Bank, NIFTY IT and SENSEX, with interactive candlestick charts from 1 minute to 1 month",
      "Zoom, pan and a crosshair readout, indicator overlays, your own custom indicators and drawing tools — trend lines, levels, zones and channels you can save with your layout",
      "Backtests, forward tests and charts use prices from your own broker account when it supplies data, and say plainly which source they used",
      "A markets overview with advances and declines, top gainers and losers, volume leaders and a NIFTY 50 heatmap, plus live quotes, 52-week range and corporate actions, on accounts with live market data",
      "A watchlist with the day's change for each stock",
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
    title: "Help & Support",
    icon: LifeBuoy,
    items: [
      "Help & Support inside the app: every request and every reply in one place, with a notification and an email when we answer",
      "Reply to any email we send and your reply becomes a numbered support request, so nothing gets lost in an inbox",
      "A person on the team reads and answers every request, including account, billing and refund questions",
      "A feedback button on every page that opens a request too",
    ],
  },
  {
    title: "Options Lab",
    icon: Sigma,
    items: [
      "Build multi-leg options positions — spreads, straddles, strangles, iron condors and more — from ready-made templates or leg by leg",
      "Payoff chart at expiry and today, net credit or debit, max profit and loss, and exact breakevens",
      "Pick any contract — underlying, expiry, call or put, strike — and see its price, bid and ask, volume, open interest and all six Greeks: IV, delta, gamma, theta, vega and rho",
      "Live option chain from your own broker account (Groww, Upstox, Dhan), paged on the server so even 200-strike chains stay fast",
      "Every Greek labelled: provided by your broker, calculated by us from the contract's price, or estimated — with warnings for stale, one-sided, wide-spread, untraded or expired contracts",
      "Free trial without a broker: the exchange's real contracts with clearly-labelled estimated prices",
      "Position Greeks: delta, gamma, theta, vega and rho",
      "Turn the contracts you picked into a saved strategy in one step — strikes become “N strikes from at-the-money” so it re-picks them every day — then set entry and exit time, days, stop-loss and target",
      "Options backtests on real historical option prices, and forward tests on live prices with no orders placed",
      "Send the legs as real orders to your broker after a priced preview — buy legs first, open legs cancelled if one is refused",
    ],
    soon: ["Option chains from more brokers (Zerodha, Angel One, Fyers, 5paisa)"],
  },
  {
    title: "Analyst Pro",
    icon: Gauge,
    items: [
      "Pick any stock and see what its daily chart says through standard indicators: trend, momentum, volume and volatility",
      "Every indicator shows its reading in plain words and its weight, so you can see exactly how the overall picture was counted",
      "Nearest support and resistance from recent swing points, and the typical daily range",
      "Counts what the chart shows today. It is not a forecast, a prediction of the price, or advice",
    ],
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
      "Builds blocks, indicators, concepts and strategies in a window right where you are: it explains the idea, asks how you define it, and shows a demo on a made-up stock before anything is created",
      "Concepts can apply their blocks in sequence or all at one time",
      "Answers from your own data: your strategies, backtest results, forward tests and risk settings",
      "Explains why each forward test happened and flags risk events as they occur",
      "Chat in a side panel or full screen, with all your past conversations",
      "Walks you through connecting your broker step by step — and never asks for your keys or passwords in chat",
      "Knows trading and the markets in depth, not just this platform: concepts, order types, derivatives, indicators, tax, macro and more. It never gives buy or sell calls or advice, warns about risk, and ends any market view with a note that it is an analysis based on market data and sentiment, not trading advice",
      "Uses the same validator as the builder and never acts without your confirmation",
    ],
    soon: ["Warns when forward-testing results drift from the backtest", "A daily digest of your sessions"],
  },
  {
    title: "Plans, credits & billing",
    icon: Coins,
    items: [
      "A 7-day free trial of the paid features for every new account, with no card needed, then the Free plan unless you choose to upgrade",
      "Two paid plans, Trade and Pro, priced before GST: the 18% GST is added at checkout and itemised on your bill",
      "A live credits meter in the top bar that updates the moment you use the AI, voice or a backtest, with the price of each action shown before you press the button",
      "A checkout page that shows exactly what you're buying and the bill split into the price and the GST, then opens Razorpay's secure window: pay by UPI, card or netbanking",
      "Top-up packs of credits for Trade and Pro, kept for a year and used after your monthly credits",
      "A numbered invoice emailed after every payment and kept under Payments & invoices, with a credit note if a payment is refunded",
      "Cancel renewal at any time: the plan keeps running to the end of the period you've paid for",
      "A clear refund policy: refunds are reviewed and approved by our support team, so you write to us with your invoice number and a person decides",
      "Live trading, risk controls, charts, demos and forward tests never use credits",
    ],
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
