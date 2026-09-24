import { Link2 } from "lucide-react";
import ComingSoon from "@/components/coming-soon";

export const metadata = { title: "Broker Connections", robots: { index: false } };

export default function Page() {
  return (
    <ComingSoon
      title="Broker Connections"
      icon={Link2}
      description="Link a broker account so strategies can move from paper trading to live execution."
      points={[
        "Connects through the broker's official API",
        "Credentials held in secure secret storage, never in the browser",
        "The connection is tested before it's marked connected",
        "Disconnect any time from this page",
      ]}
    />
  );
}
