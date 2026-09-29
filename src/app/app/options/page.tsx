import { Sigma } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import OptionsLab from "@/components/options-lab";
import OptionsTabs from "@/components/options/options-tabs";
import { auth } from "@/lib/auth";
import { marketExtrasFor } from "@/lib/market-data";
import { prisma } from "@/lib/prisma";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";
import { brokerById } from "@/lib/brokers/catalog";

export const metadata = { title: "Options Lab", robots: { index: false } };

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  const live = !!marketExtrasFor(userId);
  // Brokers this user could send an options basket through: live trading on, connected today, F&O supported.
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, brokerConnections: { select: { broker: true, status: true, tokenExpiresAt: true } } } }) : null;
  const now = new Date();
  const basketBrokers = user?.liveTradingEnabledAt
    ? user.brokerConnections.flatMap((c) => {
        const a = LIVE_BROKERS[c.broker as keyof typeof LIVE_BROKERS];
        return a?.fno && c.status === "CONNECTED" && c.tokenExpiresAt && c.tokenExpiresAt > now ? [{ id: c.broker, name: brokerById(c.broker)?.name ?? c.broker, carry: a.fno === true }] : [];
      })
    : [];
  return (
    <div>
      <PageHeader
        title="Options Lab"
        icon={Sigma}
        description={
          live
            ? "The live option chain with OI, IV and Greeks — click B or S to add legs and see the payoff, breakevens, max profit and loss, and Greeks before you trade."
            : "Build a multi-leg options position and see its payoff, breakevens, max profit and loss, and Greeks before you trade it."
        }
      />
      <OptionsTabs active="/app/options" />
      <OptionsLab live={live} basketBrokers={basketBrokers} />
    </div>
  );
}
