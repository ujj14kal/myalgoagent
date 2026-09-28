import { NextResponse } from "next/server";
import { currentStaff, can } from "@/lib/admin/access";
import { audit } from "@/lib/admin/audit";
import { collectUserData } from "@/lib/account-export";
import { logError } from "@/lib/logger";

// Staff fulfilling a user's data request ("send me everything you hold on
// me"): the same export the user can download themselves. Always audited.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaff();
  if (!staff || !can(staff.role, "users.manage")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  try {
    const data = await collectUserData(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit(staff, "user.export", { type: "user", id }, `Exported data for ${data.profile.email}`);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="myalgoagent-data-${id}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logError("admin.user-export", err, { userId: id });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
