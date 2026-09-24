import { Siren } from "lucide-react";
import ComingSoon from "@/components/coming-soon";

export const metadata = { title: "Alerts", robots: { index: false } };

export default function Page() {
  return (
    <ComingSoon
      title="Alerts"
      icon={Siren}
      description="One place to manage every alert your strategies and instruments raise. Until then, order fills and risk events already reach you under Notifications."
    />
  );
}
