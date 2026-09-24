import { Bell, Bot, Compass, PenLine } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AgentNameForm from "@/components/agent-name-form";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import ReplayTourButton from "@/components/tutorial/replay-tour-button";
import NotificationPrefsForm from "@/components/notification-prefs-form";
import AgentShowcase from "@/components/agent-showcase";
import PageHeader from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Agent Settings", robots: { index: false } };

export default async function AgentSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;
  const agentName = user.agentName ?? DEFAULT_AGENT_NAME;

  return (
    <div>
      <PageHeader title="Agent Settings" icon={Bot} description="Personalise your agent — its name, what it tells you about, and the onboarding tour." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <CardHeader title="Agent name" subtitle="Used whenever it pops up with a notification." icon={PenLine} />
            <div className="mt-5">
              <AgentNameForm initialName={agentName} />
            </div>
          </Card>

          <Card className="p-6">
            <CardHeader title="Notifications from your agent" subtitle="Choose which routine updates it sends you." icon={Bell} />
            <div className="mt-5">
              <NotificationPrefsForm initial={{ notifyOrderFilled: user.notifyOrderFilled, notifySignalAlert: user.notifySignalAlert }} />
            </div>
          </Card>

          <Card className="p-6">
            <CardHeader title="Product tour" subtitle="Walk through MyAlgoAgent's core features again, any time." icon={Compass} />
            <div className="mt-5">
              <ReplayTourButton />
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:h-fit">
          <AgentShowcase agentName={agentName} />
        </div>
      </div>
    </div>
  );
}
