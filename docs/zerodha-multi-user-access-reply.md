Subject: Re: Multi-user access request: MyAlgoAgent (Shagoon Softech Private Limited)

Dear Nagaveni,

Thank you for your reply. Our answers to each of your points are below.

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

Kite Connect v3, per user, using that user's own session:
- `GET /user/profile` and `GET /user/margins` (account check and funds)
- `GET /portfolio/holdings` and `GET /portfolio/positions` (to show the user's real portfolio and to reconcile)
- `POST /orders/regular` and `DELETE /orders/regular/{order_id}` (place and cancel)
- `GET /orders` and `GET /orders/{order_id}` (order book and order history, for status and reconciliation)
- `GET /trades` (trade book: fills)
- `POST /session/token` (the OAuth token exchange)
- Historical candles (`GET /instruments/historical/{instrument_token}/{interval}`), only where the user has Zerodha's historical-data subscription, for charts, backtests and signals.

**7. Unique features**

- A visible-rules strategy builder (visual, code, or AI-drafted for the user to confirm), including custom blocks and multi-step setups (for example "liquidity sweep, then break of structure, then fair-value-gap retest") assembled by the user.
- Backtesting with fees and slippage that avoids look-ahead bias, on up to five years of data, and combined backtests of several strategies as one account.
- Forward testing on new data, with every hypothetical trade explained by the rule that caused it.
- Server-side risk controls independent of the screen: kill switch, loss limits, per-order and daily order limits, intraday square-off.
- A readiness check before any real order. Orders leave from a static IP registered on the user's Zerodha account (a dedicated per-user address is being rolled out; until then orders leave from our registered address).
- An AI assistant that explains the platform and trading concepts and prepares drafts for review. It never gives investment advice, never trades on its own, and every action needs the user's confirmation.

**8. Additional services and functionality**

Options analysis tools (payoff, Greeks, option chain from the user's own broker where available), a chart workspace with drawing tools, a technical-indicator reader ("Analyst Pro"), a watchlist, notifications and email alerts, plans and billing with GST invoices through Razorpay, and a support desk with numbered requests answered by our team.

**9. Intended API use: limited to Holdings, Portfolio, Positions, Order Book and Trade Book, or more?**

More than read-only: in addition to Holdings, Positions, Order Book and Trade Book (all read), we need to place and cancel orders on the user's own account for strategies the user has switched live, plus Profile and Margins to confirm the account and funds before an order. We do not need any endpoint for other people's accounts, mutual funds, GTT or alerts.

**10. SEBI Research Analyst registration**

MyAlgoAgent does not provide investment research, recommendations or advisory services, and does not hold a SEBI RA registration. It does not tell users what to buy or sell, does not rank or pick stocks and does not predict prices. Strategy rules are written by the user. Our technical-indicator reader ("Analyst Pro") only shows what standard indicators read on a stock's chart today, with each indicator's value and weight; it states plainly that it is not a forecast or advice. Our AI assistant is instructed never to give advice and adds a note that its analysis is not trading advice. We would welcome your view if you see any of this differently. [CONFIRM with your own legal advice before sending.]

**11. Market data endpoints required**

Only historical candles (above), and only where the user holds the historical-data subscription. We do not use Quote, LTP or WebSocket streaming from Kite at present: strategy rules are evaluated on candles about once a minute. We do not redistribute Zerodha data: it is shown and used only for the user who owns the session.

**12. Options: option chain and Greeks (added so nothing is missed)**

Our Options Lab builds multi-leg positions and shows payoff, breakevens, option chain (OI, change in OI, IV, PCR, max pain) and Greeks (delta, gamma, theta, vega, rho). For Zerodha users today:
- We do not read an option chain or option quotes from Kite. The chain shown comes from the user's own connected broker where that broker provides one, or from a licensed feed for permitted accounts, and every figure is labelled with its source. The Greeks are calculated by us from the contract's price (or estimated and labelled as estimates); we do not take Greeks from Zerodha.
- Option legs the user chooses to trade are sent as ordinary orders on NFO through `POST /orders/regular`, with the exchange's own contract symbols (taken from the exchange's master files, not from Kite's instrument dump), after a priced preview and the user's explicit confirmation. Buy legs go first, and if a leg fails the open legs are cancelled.
- If you would also allow option chain data for Zerodha users, we would need `GET /instruments` (NFO) and `GET /quote` (or LTP/OHLC) per user, and would use them only to show that user their own chain. We have not requested this above because we do not use it today. Please tell us if you would like it included in the request.

We are happy to schedule a demo call at your convenience.

Regards,
[Name], Director
Shagoon Softech Private Limited
https://myalgoagent.com · support@myalgoagent.com
