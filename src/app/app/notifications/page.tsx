import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NotificationActions from "@/components/notification-actions";

export const metadata = { title: "Notifications", robots: { index: false } };

const TYPE_STYLE: Record<string, string> = {
  ORDER_FILLED: "bg-brand-buy/10 text-brand-buy",
  RISK_EVENT: "bg-brand-gold/20 text-brand-navy",
  SESSION_STOPPED: "bg-brand-sell/10 text-brand-sell",
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Notifications</h1>
          <p className="mt-2 text-sm text-brand-navy/60">
            Order fills and risk events from your paper trading sessions.
          </p>
        </div>
        {unreadCount > 0 && <NotificationActions markAll />}
      </div>

      <div className="mt-6 space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between rounded-xl border p-4 ${
              n.read ? "border-black/5 bg-white" : "border-brand-primary/20 bg-brand-primary/5"
            }`}
          >
            <div>
              <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[n.type]}`}>
                {n.type.replace(/_/g, " ")}
              </span>
              <p className="text-sm text-brand-navy">
                {n.paperSessionId ? (
                  <Link href={`/app/paper-trading/${n.paperSessionId}`} className="hover:underline">
                    {n.message}
                  </Link>
                ) : (
                  n.message
                )}
              </p>
              <p className="mt-1 text-xs text-brand-navy/40">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
            </div>
            {!n.read && <NotificationActions notificationId={n.id} />}
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-brand-navy/15 p-10 text-center">
            <p className="text-sm text-brand-navy/50">No notifications yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
