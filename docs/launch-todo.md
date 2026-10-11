# Final product launch — to-do (2026-10-12)

Legend: ☐ to do · ◐ in progress · ☑ done · ✋ needs the owner. The AWS side is in `aws-production-todo.md`.

## 1. Money and users (blocks launch)
- ☐ ✋ **Payments + subscriptions + autopay** (Notion #26): provider choice (Razorpay/Stripe), plans, GST invoices, failed-payment handling, cancel/refund, entitlements per plan.
- ☐ ✋ **SES production access** (P0): real users cannot get sign-up, OTP, reset or support emails until approved.
- ☐ ✋ **Legal review** of Terms, Privacy, Risk Disclosure (still marked "template").
- ☐ ✋ **Market data licence decision** (BYO broker data vs TrueData resale; NSE fee floor).
- ☐ **Per-user static IP** (phase E): Elastic IP + egress proxy per paying user, auto-created on subscribe, released on cancel.

## 2. Trading correctness (blocks real money)
- ☐ ✋ Real-money live test: time entry/exit, Account Value check, restart recovery.
- ☐ Groww API audit against current docs; live check of Groww/Upstox/Dhan option-chain adapters with the owner's own session.
- ☐ Option chains for Zerodha / Angel One / Fyers / 5paisa.
- ☐ Recovery tests (real restart), browser and integration test suites in CI.
- ☐ Second engine task only after a duplicate-order claim review.

## 3. Product list still open (Notion FINAL VERSION UPDATES)
- ☐ #5 info icons on crowded screens · #18 chart patterns not working · #19 indicator logic per Aryan's documents (not yet seen) · #20 BSE segment · #21 intraday: 30m and above · #23 swing options: square-off / no-new-entry-after · #24 demo of multi-level entry (SL −95% looks wrong) · #25 crypto + crypto brokers · #28 team admin portal: customers, care, CRM · #30 connect Code strategy with AI.
- ☐ Dashboard blank-space bug; mascot; real UI/UX pass on /app/*.
- ☐ Verify the shipped ones live (#1–4, #6–17, #22, #27, #29) with a final audit.
- ☐ Spoken end-to-end voice confirmation after the CSP fix.

## 4. Operations
- ☐ Runbooks, restore drill, on-call alert routing (phone/SMS, not only email).
- ☐ Status page, support inbox SLAs, privacy-request process.
- ☐ Load test the new stack before launch day.

## 5. AWS final production build
See `aws-production-todo.md` (Phases A–D). Status 2026-10-12: A1, A3–A7, A9 done; VPC next, then database, website on Fargate, load balancer, CloudFront + WAF, cutover.
