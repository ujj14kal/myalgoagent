"use client";

import { useTransition } from "react";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notification-actions";

export default function NotificationActions({
  notificationId,
  markAll,
}: {
  notificationId?: string;
  markAll?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (markAll) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => markAllNotificationsRead())}
        className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary disabled:opacity-50"
      >
        Mark all read
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => markNotificationRead(notificationId!))}
      className="text-xs text-brand-navy/40 hover:text-brand-primary"
    >
      Mark read
    </button>
  );
}
