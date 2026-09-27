import { Sigma } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import OptionsLab from "@/components/options-lab";

export const metadata = { title: "Options Lab", robots: { index: false } };

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Options Lab"
        icon={Sigma}
        description="Build a multi-leg options position and see its payoff, breakevens, max profit and loss, and Greeks before you trade it."
      />
      <OptionsLab />
    </div>
  );
}
