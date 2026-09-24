import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NotificationActions from "@/components/notification-actions";
import EmptyState from "@/components/empty-state";
import { Bell, CircleCheck, CircleStop, TriangleAlert } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Notifications", robots: { index: false } };

const TYPE_META: Record<string, { label: string; cls: string; Icon: typeof Bell }> = {
  ORDER_FILLED: { label: "Order filled", cls: "bg-brand-buy/10 text-brand-buy", Icon: CircleCheck },
  RISK_EVENT: { label: "Risk event", cls: "bg-brand-gold/15 text-[#8a7437]", Icon: TriangleAlert },
  SESSION_STOPPED: { label: "Session stopped", cls: "bg-brand-navy/[0.06] text-brand-navy/60", Icon: CircleStop },
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        icon={Bell}
        description="Order fills and risk events from your paper trading sessions."
        actions={unreadCount > 0 ? <NotificationActions markAll /> : undefined}
      />

      {notifications.length === 0 && (
        <div className="mt-8">
          <EmptyState pose="alert" title="No notifications yet." description="Order fills, risk events, and session changes from your paper trading will show up here." />
        </div>
      )}

      {notifications.length > 0 && (
        <ul className="surface divide-y divide-black/[0.05] overflow-hidden">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] ?? { label: n.type.replace(/_/g, " ").toLowerCase(), cls: "bg-brand-navy/[0.06] text-brand-navy/60", Icon: Bell };
            return (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-4 sm:px-5 ${n.read ? "" : "bg-brand-primary/[0.03]"}`}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.cls}`}>
                  <meta.Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">{meta.label}</p>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" aria-label="Unread" />}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-brand-navy">
                    {n.paperSessionId ? (
                      <Link href={`/app/paper-trading/${n.paperSessionId}`} className="hover:text-brand-primary hover:underline">
                        {n.message}
                      </Link>
                    ) : (
                      n.message
                    )}
                  </p>
                  <time className="mt-1 block text-xs text-brand-navy/40">
                    {new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </time>
                </div>
                {!n.read && <NotificationActions notificationId={n.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
