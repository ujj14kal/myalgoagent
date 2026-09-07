import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";
import FeedbackWidget from "@/components/feedback-widget";
import TutorialProvider from "@/components/tutorial/tutorial-provider";
import AgentToastProvider from "@/components/agent-toast/agent-toast-provider";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";

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
    select: { username: true, agentName: true, tutorialCompletedAt: true },
  });

  if (!dbUser?.username) {
    redirect("/onboarding/username");
  }

  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, read: false } });

  return (
    <TutorialProvider initialAgentName={dbUser.agentName} tutorialCompleted={!!dbUser.tutorialCompletedAt}>
      <AgentToastProvider agentName={dbUser.agentName ?? DEFAULT_AGENT_NAME}>
        <div className="flex min-h-screen bg-brand-bg">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <AppTopbar user={session.user} unreadCount={unreadCount} />
            <main className="flex-1 p-6">{children}</main>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 px-6 py-3 text-xs text-brand-navy/40">
              <span>© {new Date().getFullYear()} MyAlgoAgent™, a product of Shagoon Softech Pvt. Ltd.</span>
              <span className="flex items-center gap-3">
                <a href="/terms" className="hover:text-brand-primary">Terms</a>
                <a href="/privacy-policy" className="hover:text-brand-primary">Privacy Policy</a>
                <a href="/risk-disclosure" className="hover:text-brand-primary">Risk Disclosure</a>
              </span>
            </footer>
          </div>
          <FeedbackWidget />
        </div>
      </AgentToastProvider>
    </TutorialProvider>
  );
}
