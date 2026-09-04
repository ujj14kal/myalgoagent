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
  if (!session?.user) {
    redirect("/login");
  }

  const unreadCount = session.user.id
    ? await prisma.notification.count({ where: { userId: session.user.id, read: false } })
    : 0;

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
