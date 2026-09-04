import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-purge-secret");
  if (!secret || secret !== process.env.PURGE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await prisma.user.findMany({
    where: { status: "PENDING_DELETION", deletionScheduledFor: { lte: new Date() } },
    select: { id: true, email: true },
  });

  for (const user of due) {
    // Every related model has onDelete: Cascade back to User, so this
    // deletes strategies, backtests, paper sessions, orders, etc. too.
    await prisma.user.delete({ where: { id: user.id } });
  }

  return NextResponse.json({ purged: due.length });
}
