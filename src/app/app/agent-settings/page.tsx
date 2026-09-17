import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AgentNameForm from "@/components/agent-name-form";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import RobotAvatar from "@/components/robot/robot-avatar";
import ReplayTourButton from "@/components/tutorial/replay-tour-button";
import NotificationPrefsForm from "@/components/notification-prefs-form";

export const metadata = { title: "Agent Settings", robots: { index: false } };

export default async function AgentSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Agent Settings</h1>
      <p className="mt-1 text-sm text-brand-navy/50">Personalize your AlgoAgent and its onboarding tour.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-sm font-semibold text-brand-navy">Agent name</h2>
            <p className="mt-1 text-xs text-brand-navy/50">
              Give your agent a name — it&rsquo;ll use it whenever it pops up with a notification.
            </p>
            <div className="mt-4">
              <AgentNameForm initialName={user.agentName ?? DEFAULT_AGENT_NAME} />
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-sm font-semibold text-brand-navy">Notifications from your agent</h2>
            <p className="mt-1 text-xs text-brand-navy/50">
              Choose which routine updates your agent sends you.
            </p>
            <div className="mt-4">
              <NotificationPrefsForm
                initial={{ notifyOrderFilled: user.notifyOrderFilled, notifySignalAlert: user.notifySignalAlert }}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-sm font-semibold text-brand-navy">Product tour</h2>
            <p className="mt-1 text-xs text-brand-navy/50">
              Walk through MyAlgoAgent&rsquo;s core features again, any time.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-brand-primary">
              <ReplayTourButton />
              <span>Replay the tour</span>
            </div>
          </section>
        </div>

        <div className="sticky top-6 h-fit">
          <section className="hover-lift rounded-2xl border border-black/5 bg-white p-6 text-center">
            <RobotAvatar size={64} className="mx-auto" />
            <p className="mt-3 text-sm font-semibold text-brand-navy">{user.agentName ?? DEFAULT_AGENT_NAME}</p>
            <p className="text-xs text-brand-navy/50">is watching over your account.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
