import { Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { sendersFrom } from "@/lib/admin/outreach";
import { googleConfigured } from "@/lib/email";
import OutreachForm from "@/components/admin/outreach-form";
import { AdminPageHeader, Card, Empty, Pill, ist } from "@/components/admin/ui";

export default async function OutreachPage() {
  await requireStaff("outreach");
  const sent = await prisma.adminAuditLog.findMany({ where: { action: { in: ["outreach.send", "outreach.test"] } }, orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <div className="space-y-5">
      <AdminPageHeader title="Outreach" icon={Send} description="Write to creators and partners: choose the address it comes from, type your text, and it goes out as a clean, branded email." />
      {!googleConfigured() && <p className="rounded-xl bg-brand-gold/15 px-4 py-3 text-sm text-[#8a7437]">The Google Workspace sending route isn&rsquo;t configured on the server, so nothing can be sent yet.</p>}
      <Card title="New message">
        <OutreachForm senders={sendersFrom(process.env.OUTREACH_SENDERS)} />
      </Card>
      <Card title="Recently sent" pad={false}>
        {sent.length === 0 ? (
          <Empty>Nothing sent yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {sent.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy">
                  {s.summary} {s.action === "outreach.test" && <Pill>test</Pill>}
                </p>
                <p className="mt-0.5 text-[11px] text-brand-navy/40">{ist(s.createdAt)} · {s.actorEmail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
