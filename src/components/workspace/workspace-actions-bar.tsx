"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWorkspace, duplicateWorkspace, setWorkspaceStatus } from "@/lib/workspace-actions";

export default function WorkspaceActionsBar({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const btn = "rounded-full border border-brand-navy/20 px-3.5 py-1.5 text-xs font-semibold text-brand-navy/70 hover:bg-brand-bg disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
        const r = await duplicateWorkspace(id);
        if ("error" in r) return setError(r.error);
        router.push(`/app/workspaces/${r.id}`);
      })}>
        Duplicate
      </button>
      <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
        const r = await setWorkspaceStatus(id, archived ? "ACTIVE" : "ARCHIVED");
        if ("error" in r) return setError(r.error);
        router.refresh();
      })}>
        {archived ? "Reactivate" : "Archive"}
      </button>
      <button type="button" disabled={pending} className={`${btn} text-brand-sell`} onClick={() => {
        if (!window.confirm("Delete this workspace? The strategies it published stay (as ordinary strategies); its drafts and version history are removed.")) return;
        start(async () => {
          const r = await deleteWorkspace(id);
          if ("error" in r) return setError(r.error);
          router.push("/app/workspaces");
        });
      }}>
        Delete
      </button>
      {error && <span className="text-xs font-medium text-brand-sell" role="alert">{error}</span>}
    </div>
  );
}
