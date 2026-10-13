# Credit and plan pricing research (2026-10-13)

Goal: paid plans that feel generous for a month, a Free plan that only lets people build and backtest (never run), and margins that hold.
All rupee figures are before GST. FX assumed at ₹88 per US$. Nothing here is built; it is a proposal.

## 1. What a credit really costs us

Credits only meter three things: the AI assistant, voice, and backtests. Live trading, forward tests, charts and risk controls use no credits.

| Action | Credits now | Our cost, typical | Our cost, worst | Cost per credit (typical / worst) | What drives it |
|---|---|---|---|---|---|
| AI reply | 2 | ₹0.17 | ₹0.35 | ₹0.09 / ₹0.18 | gpt-oss-120b on Bedrock (about $0.15 in / $0.60 out per 1M tokens) plus the guardrail check on input and output |
| AI build (tools, 2–3 rounds) | 5 | ₹0.60 | ₹1.20 | ₹0.12 / ₹0.24 | same, with 3–4× the tokens |
| Rule writer | 3 | ₹0.30 | ₹0.60 | ₹0.10 / ₹0.20 | same |
| Voice exchange | 6 | ₹1.60 | ₹4.30 | ₹0.27 / ₹0.72 | Transcribe (about $0.024/min) plus Polly generative ($30 per 1M characters) |
| Read aloud | 3 | ₹1.30 | ₹1.90 | ₹0.43 / ₹0.63 | Polly generative only |
| Backtest | 1–3 | ₹0.02 | ₹0.10 | ₹0.02–0.05 | a few seconds of Fargate; market data comes from the user's broker or the free feed |

Findings:
1. The old planning figure of ₹0.30–0.33 per credit is conservative. A realistic mixed month costs about **₹0.14 per credit** (60% AI text, 25% voice, 15% backtests).
2. Voice and read-aloud are the only actions priced close to their cost. Text AI and backtests are cheap, so credits can be much more generous on those.
3. Backtests are almost free to run. The credit price on them is an abuse control, not a cost recovery.

## 2. Fixed cost of each paying user (not credits)

| Item | Trade | Pro | Note |
|---|---|---|---|
| Own static IP (relay + Elastic IP) | ₹640 | ₹640 | US$7.3; falls to about ₹400 with the shared-relay design at 50+ users |
| Razorpay autopay (2% + about 1%) | ₹71 | ₹124 | the GST on that fee is claimable as input credit; top-ups pay 2% |
| Database, logs, NAT data | ₹20 | ₹20 | estimate |
| **Total before credits** | **₹731** | **₹784** | |
| Contribution before credits | **₹1,268** | **₹2,715** | price minus the above |

The shared stack (about US$95–120 a month, roughly ₹10,000) is covered by about 8–10 Trade subscribers.

## 3. Current plans and what each is worth to us

Contribution per subscriber per month, after IP, payment fee, infra share and credits:

| Plan | Credits | 40% used (typical) | 100% used, mixed | 100% used, worst case (₹0.33) |
|---|---|---|---|---|
| Trade now | 1,500 | ₹1,184 (59%) | ₹1,058 (53%) | ₹773 (39%) |
| Pro now | 4,000 | ₹2,491 (71%) | ₹2,155 (62%) | ₹1,395 (40%) |

Margins are higher than they need to be, so credits can roughly double without touching the price. Razorpay plans cannot be edited, but credits are not part of the Razorpay plan, so no plan needs recreating.

## 4. Proposed paid plans

| | Trade now | Trade proposed | Pro now | Pro proposed |
|---|---|---|---|---|
| Price | ₹1,999 | ₹1,999 | ₹3,499 | ₹3,499 |
| Credits per month | 1,500 | **3,000** | 4,000 | **8,000** |
| Daily AI replies / builds / voice | 40 / 15 / 40 | **60 / 20 / 20** | 100 / 40 / 120 | **150 / 50 / 60** |
| Live strategies at once | 3 | **5** | 10 | **20** |
| Forward tests at once | 15 | **30** | 40 | **100** |
| Top-up rate beats the plan rate? | | ₹0.67 per credit in plan | | ₹0.44 per credit in plan |

What 3,000 credits means in use: 1,500 AI replies, or 600 builds, or 500 voice exchanges, or 3,000 backtests. A heavy day (20 replies, 5 builds, 20 backtests) uses about 85 credits, so Trade covers 35 heavy days and Pro covers 90.

Margin after the change:

| Plan | 40% used | 100% used, mixed | 100% used, worst case |
|---|---|---|---|
| Trade 3,000 | ₹1,100 (55%) | ₹848 (42%) | ₹278 (14%) |
| Pro 8,000 | ₹2,267 (65%) | ₹1,595 (46%) | ₹75 (2%) |

Voice is the one place the worst case can hurt (a 45–60 second question with a long spoken answer, every time, all month). Keep that bounded:
- daily voice caps drop (Trade 40 to 20, Pro 120 to 60); the other daily caps rise
- cap one spoken answer at about 500 characters and listening at 45 seconds
- use Mumbai's Neural voice (half the price) for read-aloud; keep generative for live voice
- watch real usage for the first month and tune

Live slots and forward tests cost almost nothing per slot (shared engine), but the 15-second checks multiply with users. Load-test the engine before enforcing the higher slot caps; slots are not enforced in code yet.

## 5. Top-ups (in one-time packs, final, kept 12 months)

| Pack now | Per credit | Pack proposed | Per credit |
|---|---|---|---|
| 250 / ₹299 | ₹1.20 | 400 / ₹299 | ₹0.75 |
| 750 / ₹799 | ₹1.07 | 1,200 / ₹799 | ₹0.67 |
| 2,000 / ₹1,799 | ₹0.90 | 3,000 / ₹1,799 | ₹0.60 |
| 5,000 / ₹3,999 | ₹0.80 | 8,000 / ₹3,999 | ₹0.50 |

Every pack stays above Pro's plan rate (₹0.44), so upgrading is always the better deal, and at least 60% above the ₹0.14 mixed cost.

## 6. Free plan: build and backtest only

| | Now | Proposed |
|---|---|---|
| Strategy builder, charts, risk tools | yes | yes |
| Saved strategies | not capped | up to 3 |
| Backtests | 20 credits a month, daily candles up to 1 year | same (about ₹0.5 of cost) |
| AI replies | 2 for the life of the account | 2 for the life of the account |
| Voice, intraday and long backtests | no | no |
| Forward tests | 2 | **0** (a running strategy is a paid feature) |
| Live trading | no | no (needs the paid plan and its own IP) |
| 7-day trial | 300 credits, 5 forward tests, no live | keep as is; revisit after conversion data |

A Free account costs about ₹1 a month. The trial costs at most ₹100 (300 credits at the worst case) and realistically ₹30–40.

## 7. Assumptions to check before this goes live
1. Token counts per reply are estimated (about 6,000 in, 700 out). The database stores `inputTokens` and `outputTokens` per message, so an average from production would replace the estimate.
2. The guardrail price (about $0.25 per 1,000 text units across its two checks) and Transcribe's Mumbai rate come from public price lists, not our bill.
3. FX ₹88 per US$.
4. Comparison with other Indian algo platforms was not researched.
5. Income tax, support time and the Shagoon Softech overhead are not in these margins.

## 8. If approved, the change list
`src/lib/credits/config.ts` (plans, daily caps, slots, top-up packs) and its tests; the pricing page, FAQ, refund policy wording on top-ups, the agent's system prompt, the usage page; a one-time top-up of existing paid users' monthly balance; Razorpay top-up order amounts (orders are per request, no new plans needed); engine load test before slot caps are enforced.
