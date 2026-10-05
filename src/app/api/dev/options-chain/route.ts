import { NextRequest, NextResponse } from "next/server";
import { chainResponse } from "@/lib/options/chain-response";

// Development only: the option chain as a free-trial account (no broker, no licensed feed) sees it,
// for checking the Options Lab screens without signing in. Not served in production.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return chainResponse("dev-free-trial", request.nextUrl.searchParams);
}
