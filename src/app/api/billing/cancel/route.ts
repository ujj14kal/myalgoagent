import { billingRoute } from "@/lib/billing/route";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  billingRoute(req, async (userId) => {
    const { endsAt } = await cancelSubscriptionAtPeriodEnd(userId);
    return { endsAt: endsAt?.toISOString() ?? null };
  });
