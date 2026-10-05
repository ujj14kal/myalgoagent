import { Sigma } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import OptionsLab from "@/components/options-lab";
import OptionsTabs from "@/components/options/options-tabs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";
import { brokerById } from "@/lib/brokers/catalog";

export const metadata = { title: "Options Lab", robots: { index: false } };

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
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
        description="Pick any contract — underlying, expiry, call or put, strike — from your broker's live option chain, with IV and all the Greeks labelled by where they came from. Add legs and see the payoff, breakevens, max profit and loss before you trade."
      />
      <OptionsTabs active="/app/options" />
      <OptionsLab basketBrokers={basketBrokers} />
    </div>
  );
}
