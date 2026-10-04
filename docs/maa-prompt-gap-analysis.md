# Gap analysis — "Prompt (1).pdf" vs the current MyAlgoAgent code

Read-only review (5 Oct 2026). Status: ✅ done · 🟡 partial · ❌ missing · 🔎 can only be proven with live data or a signed-in browser.
Nothing here was changed. No real order was placed or tested.

| # | Requirement (PDF section) | Status | What the code shows |
|---|---|---|---|
| 3–4 | Pagination everywhere, one shared component | ❌ | No pagination component. Lists are capped with `take` (orders 200, live orders 50, notifications 100, support 50, options strategies 20). Only the admin users and audit pages take a page parameter. No page size, sort, search or filter state elsewhere. |
| 5–7 | Time-based entry and exit end to end | 🟡 | "Enter at / Exit at" rules (TIME_WINDOW), the live engine, and Groww order placement all exist. The 11:03 TARIL strategy was traced: the engine never entered because capital ₹250 couldn't buy one ₹295 share (fixed, deploy #197). A Groww **market** order has never been proven live. 🔎 |
| 8 | Time zone and scheduler checks | 🟡 | IST helpers and tests exist for the session and market window. Not checked: browser, DB and AWS time zones, clock drift, scheduler precision. The live job now runs every minute; the always-on engine (every 15 s) is written but not created on AWS. |
| 9–10 | Recovery tests and an explicit state machine | 🟡 | State (cash, position, last candle) is saved after every pass, and a 10-second claim stops double runs. There are no automated restart/recovery tests for the live engine, and the states in the PDF (WAITING → ENTRY ORDER → … → COMPLETED) are implicit, not named. |
| 11–15 | Advanced swing: multi-level entries and exits, per-level state, plan-wide risk | ❌ | Only "max pyramid entries" (extra entries). One stop-loss, one target, one trailing stop. No levels, quantities per level, per-level state, weighted average entry or plan-wide risk. Needs design. |
| 16–20 | TP1 / TP2 / TP3, lock modes, progress UI | ❌ | Not present. |
| 21–28 | Multi-strategy workspace | ❌ | Not present (only saved chart layouts). Largest item. |
| 29–33 | Custom-indicator classification | 🟡 | Two kinds only: formula, and a drawn line/ray/level. No zone, rectangle, channel, band, marker, area or classification field; no classification filters or list pagination. |
| 34–37 | Options Lab: select contract, Greeks, source labels, big-chain handling | 🟡 | Black-Scholes gives delta, gamma, theta, vega and rho, plus implied volatility from a price. No broker/calculated/estimated labelling per value, and no chain filtering or pagination. |
| 38–40 | "See how it works" demo, isolated from real orders | 🟡 | A strategy replay exists, labelled as an illustration, and no component imports the order path. There is no TP1/TP2/TP3 sequence, because those targets don't exist yet. |
| 41–42 | Dashboard blank spaces and responsiveness | 🔎 | Needs a signed-in browser at several widths. The cause can't be found from code alone. |
| 43–44 | Landing page | 🟡 | Stale: the home page still says live execution "is next" (marked "soon"). It doesn't explain Go Live, the Options Lab or custom indicators the way the PDF asks. |
| 45 | Groww API audit | 🟡 | Built from Groww's docs, with idempotent references and status mapping. Not re-audited against today's docs; rate limits are not handled; the adapter is flagged "not yet verified". |
| 46–49 | Classify orders and positions as MAA / MANUAL / UNKNOWN and MIXED | ❌ | The Broker Account page lists the broker's orders with no classification, although matching on the broker order id is possible. In the other direction, the engine already sizes its position from its own orders only, so a manual trade can't close a strategy's position. |
| 50–52 | Available to trade vs account value, and a reconciliation table | 🔎 | Both figures come from each broker's funds call. Whether they match Groww needs real data. There is no reconciliation view. |
| 53–55 | Strategy, indicator and market-data audits | 🟡 | About 700 automated tests cover indicators, no-look-ahead and sessions. No stale-data or duplicate-candle audit of the live feed. |
| 56 | First-divergence trace of a failing strategy | ✅ | Done for the TARIL strategy (capital too small, found by replaying the rules on real candles). |
| 57 | Duplicate-order protection | ✅ | Duplicate window, order reference ids, a timed-out order is kept open and checked by reference (no blind resend), and a claim stops two engines handling one strategy. |
| 58 | AWS completion | 🟡 | Amplify, RDS, EventBridge, DynamoDB, CloudWatch alarms, relay and Parameter Store exist. The Fargate engine template and code are written but nothing is created. |
| 59 | Correlation ids and "why no order?" | 🟡 | Each order has an event timeline. A live strategy keeps no log of its decisions, so "why didn't it trade" needed a replay by hand. |
| 60 | Automated tests | 🟡 | 719 tests, including all 16 Groww order-type payloads. Missing: pagination, classification, live-engine recovery, workspace, targets. |
| 62–64 | Live tests and final acceptance | 🔎 | Need real orders, so they have to be run by you or Dinesh. |

## Suggested order
1. Small and safe: per-strategy decision log ("why no order"); landing-page copy; MAA/MANUAL/UNKNOWN on the Broker Account page; one shared pagination component and server-side paging for orders, live orders, notifications, backtests and strategies; live-engine recovery tests.
2. Needs a design decision first: TP1/TP2/TP3 and multi-level swing entries and exits (engine, saved state, UI).
3. Then: custom-indicator classifications, Options Lab source labels and chain filters.
4. Last: the workspace.
