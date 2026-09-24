import { Radio } from "lucide-react";
import ComingSoon from "@/components/coming-soon";

export const metadata = { title: "Live Trading", robots: { index: false } };

export default function Page() {
  return (
    <ComingSoon
      title="Live Trading"
      icon={Radio}
      description="Run a strategy you've already backtested and paper traded against a real broker account."
      points={[
        "Connect a supported broker account first",
        "Server-side risk checks before every order",
        "Always an explicit, manual start — never automatic",
        "The kill switch covers live orders too",
      ]}
    />
  );
}
