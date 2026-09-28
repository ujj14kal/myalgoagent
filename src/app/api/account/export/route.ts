import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { collectUserData } from "@/lib/account-export";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

export async function GET() {
  try {
    return await buildExport();
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    logError("api/account/export", err);
    return NextResponse.json({ error: "Couldn't build your export — please try again." }, { status: 500 });
  }
}

async function buildExport() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Loads every row the account owns into memory in one go — by far the
  // heaviest read in the app, so it's metered tightly. A real person needs
  // this a handful of times, ever.
  await enforceRateLimit(`account-export:${userId}`, 5, 10 * 60_000);

  const exportData = await collectUserData(userId);
  if (!exportData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = `myalgoagent-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
