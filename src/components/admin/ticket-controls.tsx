"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTicket } from "@/lib/admin/actions";

type Status = "OPEN" | "PENDING" | "RESOLVED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

/** Status, priority, assignee and tags for one conversation — each saves on change. */
export default function TicketControls({
  kind,
  id,
  status,
  priority,
  assigneeId,
  tags,
  team,
}: {
  kind: "case" | "feedback";
  id: string;
  status: Status;
  priority: Priority;
  assigneeId: string | null;
  tags: string[];
  team: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tagText, setTagText] = useState(tags.join(", "));
  const router = useRouter();
  const save = (patch: Parameters<typeof updateTicket>[2]) =>
    start(async () => {
      setError(null);
      const r = await updateTicket(kind, id, patch);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  const field = "mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-brand-navy disabled:opacity-60";

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <label className="block text-xs font-semibold text-brand-navy/50">
        Status
        <select className={field} value={status} disabled={pending} onChange={(e) => save({ status: e.target.value as Status })}>
          <option value="OPEN">Needs reply</option>
          <option value="PENDING">Waiting on user</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-brand-navy/50">
        Priority
        <select className={field} value={priority} disabled={pending} onChange={(e) => save({ priority: e.target.value as Priority })}>
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-brand-navy/50">
        Assigned to
        <select className={field} value={assigneeId ?? ""} disabled={pending} onChange={(e) => save({ assigneeId: e.target.value || null })}>
          <option value="">Nobody</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-brand-navy/50">
        Tags
        <input
          className={field}
          value={tagText}
          placeholder="broker, bug, billing"
          onChange={(e) => setTagText(e.target.value)}
          onBlur={() => tagText !== tags.join(", ") && save({ tags: tagText.split(",") })}
        />
      </label>
      {error && <p className="text-xs text-brand-sell">{error}</p>}
    </div>
  );
}
