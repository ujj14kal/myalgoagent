import { prisma } from "@/lib/prisma";

// Readiness for monitors and canaries: also checks the database answers.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return Response.json({ ok: true, db: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
