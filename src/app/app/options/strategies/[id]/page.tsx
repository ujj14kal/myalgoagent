import { notFound } from "next/navigation";
import { Sigma } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import OptionsTabs from "@/components/options/options-tabs";
import OptionStrategyPage from "@/components/options/strategy-page";
import type { OptionStrategyInput } from "@/lib/option-strategy-actions";

export const metadata = { title: "Options strategy", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditOptionStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  const s = await prisma.optionStrategy.findFirst({ where: { id, userId: session.user.id } });
  if (!s) notFound();
  const initial: OptionStrategyInput = {
    id: s.id,
    name: s.name,
    underlying: s.underlying,
    legs: s.legs as unknown as OptionStrategyInput["legs"],
    expiryRule: s.expiryRule as OptionStrategyInput["expiryRule"],
    entryMinute: s.entryMinute,
    exitMinute: s.exitMinute,
    weekdays: s.weekdays,
    stopLossUnit: s.stopLossUnit as OptionStrategyInput["stopLossUnit"],
    stopLossValue: s.stopLossValue,
    targetUnit: s.targetUnit as OptionStrategyInput["targetUnit"],
    targetValue: s.targetValue,
  };
  return (
    <div>
      <PageHeader title={s.name} icon={Sigma} description="Edit this options strategy. Past backtests keep the settings they ran with." />
      <OptionsTabs active="/app/options/strategies" />
      <OptionStrategyPage initial={initial} />
    </div>
  );
}
