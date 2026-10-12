import { billingRoute } from "@/lib/billing/route";
import { BillingError } from "@/lib/billing/service";
import { requestRefund } from "@/lib/billing/refunds";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId, body) => {
    if (typeof body.paymentId !== "string") throw new BillingError("Choose a payment.");
    const { ref } = await requestRefund(userId, body.paymentId, body.reason);
    return { ref };
  });
