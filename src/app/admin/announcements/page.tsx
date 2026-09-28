import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import AnnouncementForm from "@/components/admin/announcement-form";
import EndAnnouncement from "@/components/admin/end-announcement";
import { AdminPageHeader, Card, Empty, Pill, ist } from "@/components/admin/ui";

const TONE = { INFO: "blue", SUCCESS: "green", WARNING: "gold", CRITICAL: "red" } as const;

export default async function AnnouncementsPage() {
  await requireStaff("announcements");
  const now = new Date();
  const all = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const live = (a: (typeof all)[number]) => a.active && a.startsAt <= now && (!a.endsAt || a.endsAt > now);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Announcements" icon={Megaphone} description="A banner across the top of the app for every signed-in user — maintenance windows, new features, important changes. The newest live one is shown." />
      <Card title="New announcement">
        <AnnouncementForm />
      </Card>
      <Card title="History" pad={false}>
        {all.length === 0 ? (
          <Empty>Nothing announced yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {all.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-navy">
                    {a.title} <Pill tone={TONE[a.level]}>{a.level.toLowerCase()}</Pill>
                    {live(a) ? <Pill tone="green" dot>live</Pill> : <Pill>ended</Pill>}
                    {a.notifiedAt && <Pill tone="purple">notified</Pill>}
                  </p>
                  <p className="mt-0.5 text-xs text-brand-navy/60">{a.body}</p>
                  <p className="mt-1 text-[11px] text-brand-navy/40">
                    {ist(a.createdAt)}
                    {a.endsAt && ` → ${ist(a.endsAt)}`}
                  </p>
                </div>
                {live(a) && <EndAnnouncement id={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
