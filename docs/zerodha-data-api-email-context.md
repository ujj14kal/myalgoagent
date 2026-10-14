# Context: Zerodha multi-user / data API email (for a new session)

Read this first if you are picking up the Zerodha access request in a new session. The full draft of the email is in `docs/zerodha-multi-user-access-reply.md`. This page explains why it exists, what it asks for, and what is still open.

## Status

- **Do not send the email yet.** The owner (Ujjwal) will send it only after every feature we want to offer is built, so the data list is final. If a new feature is added before then, add its data points to the table in section 11 of the draft.
- The draft is written but has placeholders that need the owner (see "Open items").

## Why the email exists

Zerodha's API team (Nagaveni) replied to our multi-user access request with 11 questions. Kite Connect normally gives one app one user; we need multi-user access so that every Zerodha user who connects through MyAlgoAgent gets the complete product. The draft answers all 11 questions in order (workflow, use case, production/beta, demo video, website and demo credentials, endpoints, unique features, additional services, intended API use, SEBI RA registration, market data endpoints), plus 11a (same data for every user) and 12 (options chain and Greeks).

## The principle the owner set

- **Same data from every broker.** A feature must work the same whichever broker a user connects. Zerodha users must not get a reduced version.
- **Ask for all of it.** The email lists the data points for every feature we offer, not only what Zerodha users already get. If Kite cannot provide an item, the email asks Zerodha to say which one, so we can state it honestly in the product.
- Data is used only for the user who owns the session, kept briefly in memory, never redistributed or sold. We are open to Zerodha charging for market data per user or per platform.

## What the draft asks for

Account and trading (per user): `POST /session/token`, profile, margins, holdings, positions, place/modify/cancel regular orders, order book, order history and fills, trade book, order margin and basket margin.

Market data (per user), by feature (section 11 of the draft):

| Feature | Data points |
|---|---|
| Charts and drawing tools | Historical candles (OHLC, volume, open interest), 1 minute to 1 day, equities, indices, F&O; live forming candle from ticks |
| Backtests (5 years, combined) | Historical candles for every symbol and timeframe, index data, lot and tick sizes |
| Forward tests and live strategies | Latest candle each minute, last price and trade time, previous close, live ticks, instrument token, lot size, tick size, circuit limits |
| Order preview, protected limit prices | Last price, bid, ask, 5-level depth, circuit limits, previous close |
| Watchlist | Last price, change and change %, open, high, low, previous close, volume, live |
| Portfolio and positions | Last price per holding and position, previous close |
| Markets overview | Index levels and day change, advances and declines, top gainers and losers, most active by volume and turnover, index constituents |
| Markets heatmap | Index constituents with last price and change %, index quotes (NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, India VIX, sectoral indices) |
| Instrument search and sector filters | Full instrument master for NSE, BSE, indices, refreshed daily |
| Trading calendar and market status | Open/closed status and exchange holidays |
| Futures contracts | Futures in the NFO master, quotes with OI, historical candles |
| Key stats per stock | 52-week high/low, day OHLC, volume, average price, circuit limits, previous close, corporate actions |
| Options Lab: contract picker and chain | Expiries and strikes from the NFO master; per contract: last price, bid, ask, previous close, volume, open interest, previous-day OI, lot size; underlying spot and its update time |
| Options Lab: Greeks | IV, delta, gamma, theta, vega, rho per contract: broker-provided if Kite has them, otherwise calculated by us (Black-Scholes from the contract's price), always labelled provided / calculated / estimated |
| Options Lab: chain summary | PCR and max pain (computed by us from OI) |
| Options strategies | Historical candles and OI of option contracts (including expired), live leg prices, underlying spot |
| Analyst Pro | Daily and intraday candles with volume |
| Live order screens | Order and trade updates, live ticks for symbols on screen |

Endpoints requested: `/instruments`, `/instruments/{exchange}`, `/quote`, `/quote/ohlc`, `/quote/ltp`, historical candles with OI, KiteTicker WebSocket (full mode with depth and OI).

## Where this data comes from in our code today

- Option chain and Greeks: `src/lib/options/chain.ts` (types, Greeks origin labels, flags), `broker-chains.ts` (Groww, Upstox, Dhan adapters), `chain-source.ts` (broker, licensed feed, free-trial estimate), `black-scholes.ts`.
- Market overview, movers, breadth, heatmap data: `src/lib/market-data/extras.ts` and `src/app/app/instruments/page.tsx` (today only from the licensed feed, TrueData, owner accounts only).
- Candles by broker: `src/lib/brokers/broker-candles.ts` (`CANDLE_SOURCES` includes zerodha), `broker-data.ts`.
- Account data: `src/lib/brokers/account-data.ts`.
- Zerodha users currently get candles and account data only. Quotes, option chain, market overview, heatmap, WebSocket and instrument master are **not built for Zerodha**; they depend on the access this email requests.

## Other rules to keep when editing the draft

- No investment advice anywhere. The email states MyAlgoAgent does not give advice and holds no SEBI RA registration (confirm wording with legal advice before sending).
- Never include secrets, keys or customer data. The demo account must be a purpose-made account, not a real customer's.
- Keep claims honest: the Zerodha live-order path is built to the Kite Connect v3 docs but not yet proven with real orders at volume.

## Open items before sending

1. Finish building all features the owner wants, then re-check the section 11 table against them.
2. Demo video (section 4): record sign-up, strategy build, backtest, forward test, broker connect, readiness check, Go Live screen.
3. Demo credentials (section 5): create a demo account.
4. Production vs beta wording (section 3).
5. SEBI RA wording (section 10): confirm with legal advice.
6. Sender name and title in the signature.
7. Optionally offer a demo call (already in the draft).
