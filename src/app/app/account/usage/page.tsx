import { Coins } from "lucide-react";
import { auth } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import UsagePanel from "@/components/credits/usage-panel";
import { recentEvents } from "@/lib/credits/service";

export const metadata = { title: "Credits & usage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return (
    <div>
      <PageHeader title="Credits & usage" icon={Coins} description="What you have left, what each action costs, your plan and a record of every change. The number in the top bar is always current." />
      <UsagePanel events={await recentEvents(userId)} />
    </div>
  );
}
