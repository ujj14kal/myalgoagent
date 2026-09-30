import { redirect } from "next/navigation";
import CustomIndicatorsRoot from "@/components/custom-indicators/root";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";
import TutorialProvider from "@/components/tutorial/tutorial-provider";
import AgentToastProvider from "@/components/agent-toast/agent-toast-provider";
import AgentChatProvider from "@/components/agent-chat/agent-chat-provider";
import AgentChatButton from "@/components/agent-chat/agent-chat-button";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import AnnouncementBanner from "@/components/announcement-banner";
import { isBuiltInOwner } from "@/lib/admin/access";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, agentName: true, tutorialCompletedAt: true, status: true, adminRole: true, email: true, lastSeenAt: true },
  });

  // Sessions are deleted when an account is suspended; this covers any that slipped through.
  if (dbUser?.status === "SUSPENDED") redirect("/login?error=Suspended");

  if (!dbUser?.username) {
    redirect("/onboarding/username");
  }

  const now = new Date();
  const [unreadCount, liveSessions, announcement, brokerRows, customRows] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    prisma.paperSession.count({ where: { userId: session.user.id, status: "ACTIVE" } }),
    prisma.announcement.findFirst({
      where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, body: true, level: true, link: true },
    }),
    prisma.brokerConnection.findMany({ where: { userId: session.user.id }, select: { broker: true, status: true, tokenExpiresAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.customIndicator.findMany({ where: { userId: session.user.id }, select: { name: true, def: true }, orderBy: { name: "asc" } }),
  ]);
  const customIndicators = customRows.map((c) => ({ name: c.name, def: c.def as unknown as CustomIndicatorDef }));
  // Linked brokers for the top bar: live today, or needing today's login.
  const brokers = brokerRows.map((b) => ({ broker: b.broker, live: b.status === "CONNECTED" && !!b.tokenExpiresAt && b.tokenExpiresAt > now }));
  // "Last active" for the admin portal — written at most every 10 minutes.
  if (!dbUser.lastSeenAt || now.getTime() - dbUser.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.user.update({ where: { id: session.user.id }, data: { lastSeenAt: now } }).catch(() => {});
  }
  const isStaff = !!dbUser.adminRole || isBuiltInOwner(dbUser.email);
  const agentName = dbUser.agentName ?? DEFAULT_AGENT_NAME;

  return (
    <CustomIndicatorsRoot items={customIndicators}>
    <AgentChatProvider agentName={agentName}>
    <TutorialProvider initialAgentName={dbUser.agentName} tutorialCompleted={!!dbUser.tutorialCompletedAt}>
      <AgentToastProvider agentName={agentName}>
        <div className="app-canvas flex min-h-screen overflow-x-clip">
          <AppSidebar agentName={agentName} liveSessions={liveSessions} />
          <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
            <AppTopbar user={session.user} unreadCount={unreadCount} agentName={agentName} liveSessions={liveSessions} isStaff={isStaff} brokers={brokers} />
            {announcement && <AnnouncementBanner {...announcement} />}
            <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 px-6 pb-20 pt-3 text-xs text-brand-navy/40 md:py-3">
              <span>© {new Date().getFullYear()} MyAlgoAgent™, a product of Shagoon Softech Pvt. Ltd.</span>
              <span className="flex items-center gap-3">
                <a href="/terms" className="hover:text-brand-primary">Terms</a>
                <a href="/privacy-policy" className="hover:text-brand-primary">Privacy Policy</a>
                <a href="/risk-disclosure" className="hover:text-brand-primary">Risk Disclosure</a>
              </span>
            </footer>
          </div>
        </div>
        {/* Phones have no sidebar, so the agent lives in a floating button. */}
        <AgentChatButton variant="fab" />
      </AgentToastProvider>
    </TutorialProvider>
    </AgentChatProvider>
    </CustomIndicatorsRoot>
  );
}
