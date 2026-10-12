import { billingRoute } from "@/lib/billing/route";
import { BillingError, startTopupCheckout } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId, body) => {
    const credits = Number(body.credits);
    if (!Number.isInteger(credits)) throw new BillingError("Choose a credit pack.");
    return { checkout: await startTopupCheckout(userId, credits) };
  });
