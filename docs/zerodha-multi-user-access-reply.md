Subject: Re: Multi-user access request: MyAlgoAgent (Shagoon Softech Private Limited)

Dear Nagaveni,

Thank you for your reply. Our answers to each of your points are below.

**What we are asking for, in one paragraph**

Multi-user access for MyAlgoAgent so that a Zerodha user gets the same data and trading access that users of our other connected brokers (Groww, Upstox, Dhan, Fyers, Angel One and others) get today. Every feature we offer (charts, backtests, forward tests, live strategies, Options Lab with option chain and Greeks, watchlist, portfolio, markets overview, Analyst Pro) runs on a defined set of data points. Section 11 lists each feature and every data point it needs, so you can see exactly what we ask Kite to provide. The same data points, for every Zerodha user, with nothing left out.

**1. Complete workflow: how the platform functions and how trades are executed**

MyAlgoAgent (https://myalgoagent.com) is software for building, testing and running a trader's own rule-based strategies. We do not hold funds, we do not trade for anyone, and every rule is written and visible to the user.

1. The user signs up and builds a strategy with a no-code builder (or as code, or by describing it to our AI assistant, which only prepares a draft for the user to review and confirm): entry and exit conditions from technical indicators, price/volume/candle patterns, time rules, plus stop-loss, targets, position sizing and risk limits.
2. The user backtests it on historical candles (with brokerage and slippage) and then forward tests it on new market data with notional capital. No order is placed in either step.
3. To trade, the user connects their own Zerodha account. They log in on Zerodha's own Kite login page (the Kite Connect OAuth flow); we never see their Zerodha password, PIN or 2FA. We store the resulting access token encrypted (AES-256-GCM, locked to the user's account) and use it only for that user's own calls.
4. Live trading is switched on account by account by our team. The user presses "Go Live" on a strategy, picks the broker and capital, and acknowledges the risk. Before that they must pass a read-only readiness check that places no order.
5. Once live, the strategy's rules are evaluated on our servers on the latest candle (about once a minute in market hours). When a rule fires, our server sends a regular order to Kite (`POST /orders/regular`) from a static IP registered on the user's Zerodha account, after our own checks: a global kill switch, a per-order value limit, a daily order limit and duplicate-order protection. The order is recorded before it is sent, carries our own reference as its tag, and its status is read back from Kite (`GET /orders`) and reconciled. Exits are never blocked by the kill switch. The user can pause, stop, or exit the position at any time.
6. We never place an order the user's own written rules did not produce, and we never change a user's rules.

**2. Specific use case**

A no-code algo-trading workbench for retail traders to design, test and run their own strategies on their own Zerodha account, with the testing and risk tooling around it. It is not a signal service, copy-trading or portfolio-management product.

**3. Production or Beta**

The platform itself is in production at https://myalgoagent.com (live, with a free trial and paid plans on offer). Live order placement is being enabled account by account, so only a small number of accounts can send real orders today. Our Zerodha live-order integration is built to the Kite Connect v3 documentation but has not yet been proven with real orders at volume: we would like to prove it through the access you may grant. [CONFIRM THIS WORDING BEFORE SENDING: say plainly whether you want to describe the Zerodha live-order path as production or beta.]

**4. Demo video**

[ATTACH: a screen recording of sign-up, building a strategy, a backtest, a forward test, connecting a broker, the readiness check and the Go Live screen. Link: ______ ]

**5. Website and demo credentials**

Website: https://myalgoagent.com
Demo account: [CREATE a demo account and paste the email and password here; do not use a real customer's].

**6. API endpoints required**

We would like access to the full set of endpoints our features use, so that a Zerodha user gets the same experience on MyAlgoAgent as users of other brokers. All of it is per user, with that user's own session, and shown only to that user.

*Account, portfolio and trading*
- `POST /session/token` (the OAuth token exchange), `GET /user/profile`, `GET /user/margins`
- `GET /portfolio/holdings`, `GET /portfolio/positions`
- `POST /orders/regular`, `PUT /orders/regular/{order_id}` and `DELETE /orders/regular/{order_id}` (place, modify, cancel)
- `GET /orders`, `GET /orders/{order_id}` and `GET /orders/{order_id}/trades` (order book, order history, fills), `GET /trades` (trade book)
- `POST /margins/orders` and `POST /margins/basket` (order and basket margin: to show a priced, margin-checked preview before a multi-leg options order)

*Market data* (every data point is listed per feature in section 11)
- `GET /instruments` and `GET /instruments/{exchange}` (instrument master for NSE, BSE, NFO and indices: token, trading symbol, name, lot size, tick size, expiry, strike, instrument type)
- `GET /quote`, `GET /quote/ohlc` and `GET /quote/ltp` (last price, OHLC, previous close, change, volume, average price, buy/sell quantity, 5-level market depth with bid/ask, open interest and its day high/low, 52-week and circuit limits where available, last trade time)
- `GET /instruments/historical/{instrument_token}/{interval}` (candles from 1 minute to 1 day with open interest, for equities, indices and F&O contracts, including expired contracts where Kite offers them)
- The WebSocket streaming API (KiteTicker) in full mode: ticks with depth and open interest for the instruments a user is viewing or trading

**7. Unique features**

- A visible-rules strategy builder (visual, code, or AI-drafted for the user to confirm), including custom blocks and multi-step setups (for example "liquidity sweep, then break of structure, then fair-value-gap retest") assembled by the user.
- Backtesting with fees and slippage that avoids look-ahead bias, on up to five years of data, and combined backtests of several strategies as one account.
- Forward testing on new data, with every hypothetical trade explained by the rule that caused it.
- Server-side risk controls independent of the screen: kill switch, loss limits, per-order and daily order limits, intraday square-off.
- A readiness check before any real order. Orders leave from a static IP registered on the user's Zerodha account (a dedicated per-user address is being rolled out; until then orders leave from our registered address).
- An AI assistant that explains the platform and trading concepts and prepares drafts for review. It never gives investment advice, never trades on its own, and every action needs the user's confirmation.

**8. Additional services and functionality**

- **Options Lab (already live):** build multi-leg positions (spreads, straddles, strangles, iron condors and more), see payoff at expiry and today, net credit or debit, maximum profit and loss and breakevens; a contract picker with price, bid/ask, volume and open interest; a full **option chain** (open interest, change in OI, volume, IV, PCR, max pain) and **all six Greeks** (IV, delta, gamma, theta, vega, rho) for every contract, each labelled provided, calculated or estimated.
- **Options strategies:** legs defined around the at-the-money strike, backtested on real historical option prices and forward tested on live prices, and sent as real orders after a priced preview.
- A chart workspace with drawing tools and 60+ indicators, a technical-indicator reader ("Analyst Pro"), a watchlist, notifications and email alerts, plans and billing with GST invoices through Razorpay, and a support desk with numbered requests answered by our team.

**9. Intended API use: limited to Holdings, Portfolio, Positions, Order Book and Trade Book, or more?**

More. In addition to Holdings, Positions, Order Book and Trade Book (all read), we need to place, modify and cancel orders on the user's own account for strategies the user has switched live, Profile and Margins to confirm the account and funds, the order and basket margin endpoints for a margin-checked options preview, and the market-data endpoints in the next section. We do not need any endpoint for other people's accounts, mutual funds, GTT or alerts.

**10. SEBI Research Analyst registration**

MyAlgoAgent does not provide investment research, recommendations or advisory services, and does not hold a SEBI RA registration. It does not tell users what to buy or sell, does not rank or pick stocks and does not predict prices. Strategy rules are written by the user. Our technical-indicator reader ("Analyst Pro") only shows what standard indicators read on a stock's chart today, with each indicator's value and weight; it states plainly that it is not a forecast or advice. Our AI assistant is instructed never to give advice and adds a note that its analysis is not trading advice. We would welcome your view if you see any of this differently. [CONFIRM with your own legal advice before sending.]

**11. Market data we need, feature by feature**

This is the data our platform already uses for users of other brokers. We ask for the same data points for Zerodha users, so no Zerodha user gets a reduced version of any feature. Every item is requested only for the user who owns the session.

| Feature | Data points it needs |
|---|---|
| **Charts and drawing tools** | Historical candles (open, high, low, close, volume, open interest) from 1 minute to 1 day for equities, indices and F&O contracts; the forming candle live (ticks with last price, volume and time) |
| **Backtests (up to 5 years) and combined backtests** | Historical candles as above, for every symbol and timeframe a strategy uses, including index data; lot sizes and tick sizes from the instrument master |
| **Forward tests and live strategies** | Latest candle each minute in market hours, last price and last trade time, previous close; live ticks for the forming candle; instrument token, lot size, tick size and circuit limits for order checks |
| **Order preview and protected limit prices** | Last price, bid and ask, best 5 levels of market depth, upper and lower circuit limits, previous close |
| **Watchlist** | Last price, change and change %, open, high, low, previous close, volume, for every symbol on the list, refreshed live |
| **Portfolio and positions (live value and P&L)** | Last price per holding and position, previous close (for day change), holdings and positions from the account endpoints |
| **Markets overview** | Index levels and day change for the main NSE indices; advances and declines; top gainers and top losers (price, previous close, change %, volume, turnover); most active by volume and by turnover; constituents of an index |
| **Markets heatmap** | Last price and day change % for every constituent of an index (the index member list plus a quote for each), and index quotes themselves (NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, India VIX and the sectoral indices) |
| **Instrument search and sector filters** | Full instrument master for NSE, BSE and indices (symbol, name, ISIN where available, segment, tick size), refreshed daily so new listings and delistings appear |
| **Trading calendar and market status** | Market open/closed status and exchange holidays, so charts, forward tests and live strategies do not act on a closed or holiday session |
| **Futures contracts** | Futures in the NFO instrument master (expiry, lot size), their quotes with open interest, and historical candles, for strategies that trade or reference futures |
| **Key stats on each stock** | 52-week high and low, day open, high, low, close, volume, average price, upper and lower circuit, previous close, corporate actions where available |
| **Options Lab: contract picker and option chain** | Expiry list and strike list per underlying from the instrument master; per contract: last price, bid, ask, previous close, volume, open interest, previous-day open interest (for change in OI), lot size; the underlying's spot price and its last update time |
| **Options Lab: Greeks** | Implied volatility, delta, gamma, theta, vega and rho for each contract, taken from the broker when provided and otherwise calculated by us from the contract's price. Every Greek is labelled provided, calculated or estimated |
| **Options Lab: chain summary** | Put-call ratio and max pain, which we compute from open interest across the chain |
| **Options strategies (backtest, forward test, live)** | Historical candles and open interest of option contracts (including expired contracts), live prices of every leg, spot price of the underlying for at-the-money strike selection |
| **Analyst Pro (technical-indicator reader)** | Historical daily and intraday candles of the selected stock, with volume |
| **Live order screens** | Order and trade updates for the user's own orders, and live ticks for the symbols on screen |

If any single item above is not available in Kite Connect for any reason, please tell us which one and why, so we can say so honestly in the product.

**11a. The same data for every user, and from every broker**

Our principle is that a feature works the same whichever broker a user connects. For Zerodha that means:
- every connected Zerodha user receives all the data points in section 11, including users who do not hold a separate historical-data subscription;
- the same account and trading endpoints for every user: profile, margins, holdings, positions, orders, trades, order and basket margins, and order placement, modification and cancellation;
- the same rate limits and WebSocket subscription limits per user, with our server making the calls on each user's own session and from the static IP registered for that user.

We do not redistribute Zerodha data: it is shown and used only for the user who owns the session, kept only briefly in memory to avoid repeat requests, and never shown to anyone else or sold. If Zerodha prefers to charge for market data at the platform level or per user, we are open to discussing the commercial terms.

**12. Options: option chain and Greeks**

Our option chain and Greeks are built and live. Today the chain is read through each user's own broker session where that broker offers a chain API (Groww, Upstox and Dhan), with all the per-contract data points listed in section 11. Where no broker chain is available, a free-trial view shows the exchange's real contracts with prices we estimate and label as estimates. Zerodha users do not get the chain today because we do not yet use Kite for it. To give them the full Options Lab, we ask for every option-related data point in section 11: the instrument master for NFO, quotes with open interest, volume, bid/ask and depth for every contract in the chain, live updates over KiteTicker, and historical candles with open interest for option contracts. If Kite offers implied volatility or Greeks through any endpoint, we would use those as "provided"; otherwise we calculate them ourselves and label them as calculated.

Option legs the user chooses to trade go as ordinary orders on NFO through `POST /orders/regular` after a priced, margin-checked preview and explicit confirmation: buy legs first, and if a leg fails the open legs are cancelled.

We are happy to schedule a demo call at your convenience.

Regards,
[Name], Director
Shagoon Softech Private Limited
https://myalgoagent.com · support@myalgoagent.com
