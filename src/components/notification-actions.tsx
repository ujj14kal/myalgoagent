"use client";

import { useState, useTransition } from "react";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notification-actions";

export default function NotificationActions({
  notificationId,
  markAll,
}: {
  notificationId?: string;
  markAll?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function run(action: () => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  const errorText = failed ? (
    <span className="ml-2 text-xs text-brand-sell">Couldn&rsquo;t update — try again</span>
  ) : null;

  if (markAll) {
    return (
      <>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => markAllNotificationsRead())}
          className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary disabled:opacity-50"
        >
          Mark all read
        </button>
        {errorText}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => markNotificationRead(notificationId!))}
        className="text-xs text-brand-navy/40 hover:text-brand-primary"
      >
        Mark read
      </button>
      {errorText}
    </>
  );
}
