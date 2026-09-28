import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isBuiltInOwner, requireStaff } from "@/lib/admin/access";
import { teamMembers } from "@/lib/admin/inbox";
import { AddMember, MemberRole } from "@/components/admin/team-form";
import { AdminPageHeader, Card, ago } from "@/components/admin/ui";


const ROLES = [
  { role: "Support", can: "Inbox (reply to users, notes), view users and trading ops." },
  { role: "Admin", can: "Everything Support can, plus suspend/restore accounts, sign-outs, deletion requests, data exports, announcements, AI review, System & AWS, jobs and the audit log." },
  { role: "Owner", can: "Everything, plus managing the team." },
];

export default async function TeamPage() {
  const staff = await requireStaff("team");
  const team = await teamMembers();
  const lastActive = await prisma.adminAuditLog.groupBy({ by: ["actorId"], _max: { createdAt: true } });
  const seen = (id: string) => lastActive.find((a) => a.actorId === id)?._max.createdAt ?? null;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Team" icon={ShieldCheck} description="Who can open the admin portal. They sign in with their normal MyAlgoAgent account; an “Admin” button appears in their top bar." />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card title="Members" pad={false}>
          <ul className="divide-y divide-black/[0.04]">
            {team.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-navy">
                    {m.name} {m.id === staff.id && <span className="text-xs font-normal text-brand-navy/45">(you)</span>}
                  </span>
                  <span className="block text-xs text-brand-navy/50">
                    {m.email} · last action {ago(seen(m.id))}
                  </span>
                </span>
                <MemberRole email={m.email} role={m.role} locked={isBuiltInOwner(m.email) || m.id === staff.id} />
              </li>
            ))}
          </ul>
          <div className="border-t border-black/[0.05] p-5">
            <AddMember />
          </div>
        </Card>
        <Card title="What each role can do">
          <ul className="space-y-3 text-sm">
            {ROLES.map((r) => (
              <li key={r.role}>
                <p className="font-semibold text-brand-navy">{r.role}</p>
                <p className="text-xs text-brand-navy/55">{r.can}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
