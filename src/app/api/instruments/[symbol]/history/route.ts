import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketDataProvider } from "@/lib/market-data";
import type { CandleInterval, CandleRange } from "@/lib/market-data";

const VALID_RANGES: CandleRange[] = ["1mo", "3mo", "6mo", "1y", "5y"];
const VALID_INTERVALS: CandleInterval[] = ["1d", "1wk"];

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
