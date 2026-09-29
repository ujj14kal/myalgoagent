import { Sigma } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import OptionsLab from "@/components/options-lab";
import OptionsTabs from "@/components/options/options-tabs";
import { auth } from "@/lib/auth";
import { marketExtrasFor } from "@/lib/market-data";

export const metadata = { title: "Options Lab", robots: { index: false } };

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const live = !!marketExtrasFor(session?.user?.id);
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
      <OptionsLab live={live} />
    </div>
  );
}
