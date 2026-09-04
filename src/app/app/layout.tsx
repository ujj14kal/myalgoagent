import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";

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
    select: { username: true, twoFactorEnabled: true, twoFactorRequiredBy: true },
  });

  if (!dbUser?.username) {
    redirect("/onboarding/username");
  }
  if (!dbUser.twoFactorEnabled && dbUser.twoFactorRequiredBy && dbUser.twoFactorRequiredBy < new Date()) {
    redirect("/onboarding/security-required");
  }

  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, read: false } });

  return (
    <div className="flex min-h-screen bg-brand-bg">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <AppTopbar user={session.user} unreadCount={unreadCount} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
