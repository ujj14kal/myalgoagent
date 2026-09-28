import Link from "next/link";
import { Inbox, MessageSquareText, MessagesSquare } from "lucide-react";
import { requireStaff } from "@/lib/admin/access";
import { inboxCounts, inboxRows, teamMembers, type InboxFilter } from "@/lib/admin/inbox";
import { AdminPageHeader, Card, Empty, Pill, PRIORITY_TONE, TICKET_LABEL, TICKET_TONE, ago } from "@/components/admin/ui";


const VIEWS = [
  { key: "open", label: "Needs reply" },
  { key: "pending", label: "Waiting on user" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("inbox");
  const sp = await searchParams;
  const filter: InboxFilter = {
    view: (VIEWS.find((v) => v.key === sp.view)?.key ?? (sp.q ? "all" : "open")) as InboxFilter["view"],
    type: sp.type === "case" || sp.type === "feedback" ? sp.type : "all",
    q: (sp.q ?? "").slice(0, 100),
    mine: sp.mine === "1",
    staffId: staff.id,
  };
  const [rows, counts, team] = await Promise.all([inboxRows(filter), inboxCounts(), teamMembers()]);
  const nameOf = (id: string | null) => (id ? (team.find((t) => t.id === id)?.name.split(" ")[0] ?? "someone") : null);
  const href = (patch: Partial<Record<string, string>>) => {
    const p = new URLSearchParams({ view: filter.view, type: filter.type, ...(filter.q ? { q: filter.q } : {}), ...(filter.mine ? { mine: "1" } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/admin/inbox?${p}`;
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Inbox" icon={Inbox} description="Support requests and feedback in one place. Replies reach the user on their Help & Support page and by email." />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/[0.05]">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href({ view: v.key })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter.view === v.key ? "bg-brand-navy text-white" : "text-brand-navy/60 hover:text-brand-navy"}`}
            >
              {v.label}
              {v.key === "open" && counts.open > 0 && <span className="ml-1.5 rounded-full bg-brand-gold px-1.5 text-[10px] text-brand-navy">{counts.open}</span>}
              {v.key === "pending" && counts.pending > 0 && <span className="ml-1.5 opacity-60">{counts.pending}</span>}
            </Link>
          ))}
        </div>
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/[0.05]">
          {(["all", "case", "feedback"] as const).map((t) => (
            <Link key={t} href={href({ type: t })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter.type === t ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:text-brand-navy"}`}>
              {t === "all" ? "Everything" : t === "case" ? "Support" : "Feedback"}
            </Link>
          ))}
        </div>
        <Link href={href({ mine: filter.mine ? "" : "1" })} className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${filter.mine ? "bg-brand-gold/20 text-[#6f5a22] ring-brand-gold/40" : "bg-white text-brand-navy/60 ring-black/[0.05]"}`}>
          Assigned to me
        </Link>
        <form className="ml-auto" action="/admin/inbox">
          <input type="hidden" name="view" value="all" />
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Search text, email or MAA-100001"
            className="w-64 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs outline-none focus:border-brand-primary/40"
          />
        </form>
      </div>

      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty>{filter.view === "open" ? "Inbox zero — nothing is waiting for a reply. ✨" : "Nothing here."}</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link href={`/admin/inbox/${r.kind}/${r.id}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-5 py-3.5 transition-colors hover:bg-brand-bg/70">
                  <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl ${r.kind === "case" ? "bg-brand-primary/10 text-brand-primary" : "bg-brand-gold/15 text-[#6f5a22]"}`}>
                    {r.kind === "case" ? <MessagesSquare size={15} /> : <MessageSquareText size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-brand-navy/40">{r.ref}</span>
                      <span className="truncate text-sm font-semibold text-brand-navy">{r.topic}</span>
                      {r.priority !== "NORMAL" && <Pill tone={PRIORITY_TONE[r.priority]}>{r.priority.toLowerCase()}</Pill>}
                      {r.tags.map((t) => (
                        <Pill key={t}>#{t}</Pill>
                      ))}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-brand-navy/55">{r.snippet || "(started by our team)"}</span>
                    <span className="mt-1 block text-[11px] text-brand-navy/40">
                      {r.from}
                      {r.replies > 0 && ` · ${r.replies} repl${r.replies === 1 ? "y" : "ies"}`}
                      {r.lastAuthor === "USER" && r.replies > 0 && " · user replied"}
                      {nameOf(r.assigneeId) && ` · assigned to ${nameOf(r.assigneeId)}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5">
                    <Pill tone={TICKET_TONE[r.status]} dot>
                      {TICKET_LABEL[r.status]}
                    </Pill>
                    <span className="text-[11px] text-brand-navy/40">{ago(r.lastActivityAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
