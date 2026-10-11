import { Sigma } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import OptionsTabs from "@/components/options/options-tabs";
import OptionStrategyPage from "@/components/options/strategy-page";
import { EMPTY_STRATEGY } from "@/components/options/strategy-editor";
import { strategyFromQuery } from "@/lib/options/strategy-from-legs";

export const metadata = { title: "New options strategy", robots: { index: false } };

export default async function NewOptionStrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const fromLab = typeof sp.legs === "string" && sp.legs.length > 0;
  const initial = strategyFromQuery(sp, EMPTY_STRATEGY);
  return (
    <div>
      <PageHeader title="New options strategy" icon={Sigma} description="Build a multi-leg strategy around the at-the-money strike, set when it trades and how it is protected, then backtest it on real option prices." />
      <OptionsTabs active="/app/options/strategies" />
      <OptionStrategyPage initial={initial} notes={fromLab ? ["Filled in from the legs you built in the Options Lab. Nothing is saved until you press Save strategy."] : []} />
    </div>
  );
}
