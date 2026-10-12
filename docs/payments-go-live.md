# Switching payments from test mode to live (real money)

Test mode is on today (keys `rzp_test_…`). The app code is identical in both modes; only the keys, the plans and the webhook differ.

## Before you switch (owner)
- [ ] Razorpay account is **activated for live payments** (KYC and website approval done in the Razorpay dashboard).
- [ ] Our policies are published and approved by you: Terms (plans, billing, cancellation section), Privacy Policy (payments), and a **refund / cancellation policy** page. Razorpay's activation review and card networks expect these on the website. The text in Terms is a draft pending legal review.
- [ ] **GST invoices:** not built. Needs your GSTIN, invoice numbering and place-of-supply rules. Decide whether Razorpay's invoices or ours.
- [ ] Prices and plan contents are final (Free, Trade ₹1,999, Pro ₹3,499 per month GST included; top-up packs). Razorpay plans cannot be edited after creation; a price change means new plans.
- [ ] You have tested the full flow in test mode (checkout, renewal, cancel, top-up) and the test webhook delivers.

## The switch (about 5 minutes, you run these so live keys stay with you)
1. Razorpay dashboard → switch to **Live Mode** → Settings → API Keys → generate keys.
2. Put the live keys in `.env.local` (replace the test ones): `RAZORPAY_KEY_ID=rzp_live_…` and `RAZORPAY_KEY_SECRET=…`.
3. Run `node scripts/razorpay-setup.mjs --live` (needs the MFA session). It creates the two LIVE plans, stores the keys and plan ids in Parameter Store and writes a **new** webhook secret.
4. Razorpay dashboard (Live Mode) → Settings → Webhooks → add `https://myalgoagent.com/api/webhooks/razorpay`, events: `subscription.*`, `payment.failed`, `payment.captured`, `order.paid`, `refund.processed`, secret = the new value:
   `aws ssm get-parameter --profile myalgoagent --region ap-south-1 --name /myalgoagent/app/RAZORPAY_WEBHOOK_SECRET --with-decryption --query Parameter.Value --output text`
5. Restart the website so it picks up the keys (any release does, or force a new ECS deployment).
6. Make **one real purchase yourself** (Trade, ₹1,999) and check: plan switches, payment shows in history, the webhook shows delivered in Razorpay, then cancel renewal. Refund it from the Razorpay dashboard if you like.
7. The admin portal → System → Payments card should show **Live** mode.

## Rolling back
Put the test keys back in `.env.local` and re-run `node scripts/razorpay-setup.mjs` (no `--live`). Live subscriptions already taken keep renewing in Razorpay until cancelled there; cancel them in the dashboard first.
