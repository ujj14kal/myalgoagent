import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider, VALID_RANGES, VALID_INTERVALS, isValidCombo } from "@/lib/market-data";
import type { CandleInterval, CandleRange } from "@/lib/market-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const searchParams = request.nextUrl.searchParams;
  const range = (searchParams.get("range") ?? "6mo") as CandleRange;
  const interval = (searchParams.get("interval") ?? "1d") as CandleInterval;

  if (!VALID_RANGES.includes(range) || !VALID_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "Invalid range or interval" }, { status: 400 });
  }
  if (!isValidCombo(range, interval)) {
    return NextResponse.json(
      { error: `The "${interval}" interval isn't available for the "${range}" range — the upstream feed only keeps that granularity for a shorter window.` },
      { status: 400 },
    );
  }

  // Only ever fetch symbols we actually know about — the fetch URL is
  // built from this value, so this keeps it from being used to make the
  // server request arbitrary attacker-supplied strings.
  const instrument = await prisma.instrument.findUnique({ where: { symbol } });
  if (!instrument) {
    return NextResponse.json({ error: "Unknown instrument" }, { status: 404 });
  }

  try {
    const candles = await marketDataProvider.getHistoricalCandles(symbol, range, interval);
    return NextResponse.json({
      symbol,
      provider: { name: marketDataProvider.name, isOfficial: marketDataProvider.isOfficial },
      candles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch market data" },
      { status: 502 },
    );
  }
}
