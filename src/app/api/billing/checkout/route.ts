import { billingRoute } from "@/lib/billing/route";
import { BillingError, isPaidPlan, startSubscriptionCheckout } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId, body) => {
    if (!isPaidPlan(body.plan)) throw new BillingError("Choose Trade or Pro.");
    return { checkout: await startSubscriptionCheckout(userId, body.plan) };
  });
