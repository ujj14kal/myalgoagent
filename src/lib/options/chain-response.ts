import "server-only";
import { NextResponse } from "next/server";
import { maxPain } from "@/lib/market-data";
import { logError } from "@/lib/logger";
import { loadOptionChain } from "./chain-source";
import { chainPcr, filterChain } from "./chain";

// The /api/options/chain answer for one user: the chain from their best source, filtered and paged.

const int = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

export async function chainResponse(userId: string, q: URLSearchParams): Promise<NextResponse> {
  const underlying = q.get("underlying") ?? "NIFTY";
  const expiry = q.get("expiry");
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return NextResponse.json({ error: "Invalid expiry" }, { status: 400 });

  try {
    const loaded = await loadOptionChain(userId, underlying, expiry);
    if ("error" in loaded) return NextResponse.json({ error: loaded.error, brokerIssues: loaded.brokerIssues ?? [] }, { status: 404 });
    const { chain, expiries, brokerIssues } = loaded;
    const page = filterChain(chain, { window: int(q.get("window")), strike: int(q.get("strike")), minStrike: int(q.get("minStrike")), maxStrike: int(q.get("maxStrike")), page: int(q.get("page")), size: int(q.get("size")) });
    const { rows: _all, ...meta } = chain;
    void _all;
    return NextResponse.json(
      {
        ...meta,
        expiries,
        brokerIssues,
        strikes: chain.rows.map((r) => r.strike),
        // Whole-chain figures (open interest across every strike, not just the page shown).
        pcr: chain.source.kind === "estimate" ? null : chainPcr(chain.rows),
        maxPain: chain.source.kind === "estimate" ? null : maxPain(chain.rows),
        ...page,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("api/options/chain", error, { underlying });
    return NextResponse.json({ error: "Couldn't load the option chain — try again in a moment." }, { status: 502 });
  }
}
