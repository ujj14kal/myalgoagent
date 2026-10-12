import { billingRoute } from "@/lib/billing/route";
import { BillingError, confirmSubscriptionPayment } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId, body) => {
    const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
    if (!s("paymentId") || !s("subscriptionId") || !s("signature")) throw new BillingError("The payment details are incomplete.");
    return { result: await confirmSubscriptionPayment(userId, { paymentId: s("paymentId"), subscriptionId: s("subscriptionId"), signature: s("signature") }) };
  });
