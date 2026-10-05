import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listUnderlyings } from "@/lib/options/chain-source";

// Every NSE option underlying (indices first), for the contract picker. Reference data only — no prices.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ underlyings: await listUnderlyings() }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
