import { billingRoute } from "@/lib/billing/route";
import { BillingError, confirmTopupPayment } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId, body) => {
    const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
    if (!s("orderId") || !s("paymentId") || !s("signature")) throw new BillingError("The payment details are incomplete.");
    return { result: await confirmTopupPayment(userId, { orderId: s("orderId"), paymentId: s("paymentId"), signature: s("signature") }) };
  });
