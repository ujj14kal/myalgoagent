Subject: Re: Multi-user access request: MyAlgoAgent (Shagoon Softech Private Limited)

Dear Nagaveni,

Thank you for your reply. Our answers to each of your points are below.

**What we are asking for, in one paragraph**

Multi-user access for MyAlgoAgent so that every Zerodha user who connects through us gets the same, complete set of data and trading access, with no user getting a reduced version: the full account and trading APIs, and all Kite market data our features use (instrument master, full quotes with open interest and market depth, OHLC and LTP, historical candles for equities, indices and F&O contracts, and live WebSocket streaming). The details and the feature each item supports are in points 6, 9, 11 and 12 below.

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

*Market data*
- `GET /instruments` and `GET /instruments/{exchange}` (the instrument master, including NFO, to identify equity and option contracts)
- `GET /quote`, `GET /quote/ohlc` and `GET /quote/ltp` (live quotes, OHLC and last price, including bid/ask and market depth, volume and open interest)
- `GET /instruments/historical/{instrument_token}/{interval}` (historical candles, minute to day, with open interest where available)
- The WebSocket streaming API (KiteTicker) for live ticks, so live prices and option data update in real time instead of by polling

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

**11. Market data endpoints required, and what each is used for**

We request all of these for the user who owns the session:
- **Historical candles** (with the user's historical-data subscription): charts, backtests (up to five years), the forward tests and live strategies that read candles, and the technical-indicator reader ("Analyst Pro").
- **Instrument master** (`/instruments`): to map a stock or an option contract to its Kite instrument, and to build the option chain.
- **Quote, OHLC and LTP**: the watchlist, the portfolio's live value and P&L, the markets overview (index levels, advances and declines, top gainers and losers, volume leaders), the price shown on every order preview, protected limit prices for live orders, and key stats on each stock.
- **WebSocket (KiteTicker)**: real-time ticks for the forming candle, live P&L, option-chain updates and the live order screens.
- **Option chain and Greeks**: our Options Lab shows the option chain (open interest, change in OI, volume, IV, PCR, max pain) and Greeks (delta, gamma, theta, vega, rho). We build the chain from `/instruments` (NFO) plus `/quote` for the underlying's expiry and strikes, and calculate the Greeks ourselves from each contract's price (or estimate and label them): we do not need Greeks from Zerodha. Today, for users of other brokers, the chain comes from their own broker; we would like Zerodha users to get the same.

We do not redistribute Zerodha data: it is shown and used only for the user who owns the session, kept only briefly in memory to avoid repeat requests, and never shown to anyone else or sold.

**11a. The same data for every user**

We ask that the entitlement is the same for every user who connects through MyAlgoAgent, whatever plan they are on with us:
- every connected user receives the same market-data set listed above (quotes with depth and open interest, historical candles for equities, indices and F&O, instrument master, and WebSocket streaming), so that charts, backtests, forward tests, live signals, the option chain and Analyst Pro behave identically for all of them, including users who do not hold a separate historical-data subscription;
- the same account and trading endpoints for every user: profile, margins, holdings, positions, orders, trades, order and basket margins, and order placement, modification and cancellation;
- the same rate limits and the same WebSocket subscription limits per user, with our server making the calls on each user's own session and from the static IP registered for that user.

If Zerodha prefers to charge for market data at the platform level, or per user, we are open to discussing the commercial terms.

**12. Options: option chain and Greeks, and what we need for Zerodha users**

Our option chain and Greeks are built and live. Today the chain is read through each user's own broker session where that broker offers a chain API: Groww, Upstox and Dhan. Where none is available a free-trial view shows the exchange's real contracts with prices we estimate and label as estimates. Greeks are taken from the broker when it provides them and otherwise calculated by us from the contract's price (or estimated from an assumed volatility), always labelled. Zerodha users currently do not get a chain, because we are not using Kite for it.

To give Zerodha users the same Options Lab, we request, per user and only for that user:
- `GET /instruments` (NFO) for the contracts, expiries, strikes and lot sizes;
- `GET /quote` (including open interest, volume, bid/ask and depth) for each contract in the chain, and the WebSocket for live updates;
- historical candles of option contracts (with open interest) for options backtests.

We then calculate the Greeks and IV ourselves. Option legs the user chooses to trade go as ordinary orders on NFO through `POST /orders/regular` after a priced, margin-checked preview and explicit confirmation: buy legs first, and if a leg fails the open legs are cancelled.

We are happy to schedule a demo call at your convenience.

Regards,
[Name], Director
Shagoon Softech Private Limited
https://myalgoagent.com · support@myalgoagent.com
