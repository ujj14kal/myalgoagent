# Market data: options and recommendation

Research of 5 Oct 2026. Prices are from NSE Data & Analytics' published commercials (effective 1 Apr 2026, excl. GST) and each source's public pages. Not legal advice: confirm the final setup in writing with NSE Data & Analytics (marketdata@nse.co.in) or the chosen vendor before launch.

## 1. What MyAlgoAgent needs

| # | Need | Must be real-time? | Who sees it |
|---|---|---|---|
| A | Live strategy signals (1m–1D candles, last price) | Yes | Only that user's own strategy |
| B | Forward tests (simulated) | Near real-time | That user |
| C | Backtests (deep intraday + daily history) | No | That user |
| D | Charts, watchlist, instrument pages | Nice to have | Every user, incl. ones with no broker |
| E | Options Lab: chain, OI, IV, Greeks, expired contracts | Chain live; history for backtests | That user |
| F | Market pages: movers, breadth, circuits, corporate actions | Delayed/EOD is fine | Every user |
| G | Public marketing pages | No (illustrations) | Anyone |

## 2. Every source we checked

| Source | Licensed for a paid app? | Covers | Cost |
|---|---|---|---|
| **Yahoo (today)** | **No.** Yahoo's terms forbid commercial use | Everything, unofficially | Free, but a legal risk once we charge |
| **User's own broker API** | **Yes, for that user.** The broker holds NSE's licence to show data to its own clients | A, B, C, E, D for that user | Free on Angel One, Fyers, Upstox, ICICI, 5paisa, Alice Blue; ~₹500/mo on Groww, Zerodha, Dhan (paid by the user) |
| **Licensed vendor, real-time redistribution** (TrueData, Global Datafeeds, Accelpix) | Yes | Everything for everyone | NSE's own pass-through alone is **₹875/user/month per segment** (Cash and F&O, L1, software/charting), i.e. **~₹1,750/user/month** for both, plus vendor margin. More than the ₹1,299 Basic plan |
| **NSE direct, real-time vendor licence** | Yes | Everything | ₹25.5 lakh/yr per segment fixed + the same per-user fees |
| **NSE 15-min delayed (display)** | Yes | D, F (delayed) | ₹1,00,000/yr per segment per medium (website and app counted separately) |
| **NSE end-of-day (display)** | Yes | D, F (EOD), C (daily) | ₹1,00,000/yr per segment per medium |
| **NSE 1-min snapshot, 15-min delayed** | Yes | D, F (1-min bars, delayed) | ₹1,20,000/yr per segment per medium |
| **NSE Greeks/analytics via a data vendor** | Yes | E (Greeks) | ₹150–300/user/month (no fixed fee) |
| **NSE public bhavcopy files** | Not for redistribution: giving EOD data to others needs NSE's written consent | C, F (EOD) | — |
| **TradingView widgets** | Yes, display only, with visible TradingView attribution | D, F on screen | Free. Data never reaches our servers; can't be used for signals or backtests |
| **Global APIs (Twelve Data, EODHD…)** | Their NSE redistribution is subject to the same NSE consent | Mostly EOD/delayed | Not cheaper than the above for NSE |

## 3. Recommendation

**Bring-your-own-broker data for everything about the user's own trading, TradingView widgets for display, and no resold real-time feed.**

1. **Signals, forward tests, backtests and Options Lab (A, B, C, E): the user's own broker data**, via a data adapter per broker on the same interface as today (`marketDataFor`). The broker is licensed to give its clients this data, so we redistribute nothing. Order of build:
   1. Groww (already proven for orders; candles from 2020).
   2. Angel One, Upstox, Fyers: free data, good history.
   3. ICICI Direct, 5paisa.
   4. Zerodha, Dhan: data plan ~₹500/mo for the user; ask Zerodha's startup programme (partnerships@zerodha.com) to waive it for our users.
   5. Alice Blue: candles built from its live ticks (history only outside market hours).
2. **Charts and market pages for everyone (D, F): TradingView widgets.** Free, licensed for display, live for NSE. Our own chart stays for showing strategy signals on the user's broker data.
3. **When the broker gives no data** (free Groww/Zerodha/Dhan plan, or not connected): signals and backtests need a connected data source. The UI says so plainly ("connect a broker with data access"). No silent fallback to Yahoo in production.
4. **Later, only if revenue justifies it:** a licensed **EOD or 15-min delayed** feed (₹1–1.2 lakh/yr per segment per medium) for server-side screeners/movers and pre-signup demos. Real-time redistribution (~₹1,750/user/month in NSE fees) is not worth it at our plan prices.
5. **Yahoo** stays only as a development/test source and for the illustrative replay on public pages, labelled as such; not for paying users' signals.

## 4. What this costs and changes

- Our data bill: **₹0** now (TradingView widgets free; broker data paid, where at all, by the user).
- Users: those on Groww/Zerodha/Dhan need the broker's ~₹500 data plan for broker-quality signals; the other six brokers are free.
- Build: one data adapter per broker (candles, LTP, option chain), each verified live like the Groww order test. Streaming per user runs on the Fargate engine.
- Risk removed: Yahoo's commercial-use restriction and NSE redistribution rules.

## 5. Open questions to confirm in writing

1. NSE Data & Analytics: that strategy signals and backtests computed from a user's own broker data, shown only to that user, need no licence from us.
2. Each broker's API terms: that we may use the client's data, through their own API session, inside our app for that client.
3. TradingView: widget use inside a logged-in, paid app (their free terms mention public pages).
4. Groww: whether the free plan's exclusion of data still holds and if partner pricing exists.
