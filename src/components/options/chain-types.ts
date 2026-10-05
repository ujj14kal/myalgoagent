import type { ChainNotice, ChainRow, ChainSide, ChainSourceInfo, ContractFlag, Figure, Origin } from "@/lib/options/chain";
import type { OptionLeg } from "@/lib/options/positions";

/** What /api/options/chain answers (a page of strikes plus the whole chain's facts). */
export type ChainResponse = {
  error?: string;
  brokerIssues: { broker: string; name: string; reason: string }[];
  underlying: string;
  expiry: string;
  expiries: string[];
  strikes: number[];
  spot: number | null;
  lotSize: number | null;
  source: ChainSourceInfo;
  hasDepth: boolean;
  daysToExpiry: number;
  asOf: number;
  rate: number;
  atmStrike: number | null;
  atmIv: number | null;
  assumedIv: number;
  step: number;
  notices: ChainNotice[];
  pcr: number | null;
  maxPain: number | null;
  rows: ChainRow[];
  total: number;
  page: number;
  pages: number;
  size: number;
};

export type { ChainRow, ChainSide, ContractFlag, Figure, Origin };

export const ORIGIN_STYLE: Record<Origin, { label: string; cls: string }> = {
  provided: { label: "from source", cls: "text-[#0b6b30]" },
  calculated: { label: "calculated", cls: "text-brand-primary" },
  estimated: { label: "estimated", cls: "text-[#8a7437]" },
};

/** The tooltip for a figure: where it came from. */
export function originTitle(origin: Origin | null, source: ChainSourceInfo): string {
  if (origin === "provided") return `Provided by ${source.name}`;
  if (origin === "calculated") return "Calculated by MyAlgoAgent (Black–Scholes) from this contract's own market price";
  if (origin === "estimated") return "Estimated by MyAlgoAgent from an assumed volatility — this contract has no usable price of its own";
  return "Not available";
}

export const sourceLabel = (s: ChainSourceInfo) => (s.kind === "broker" ? `Live from your ${s.name} account` : s.kind === "feed" ? s.name : `Free trial — estimated prices (underlying price: ${s.spotFrom})`);

/** A leg for the Options Lab from a chain contract: buy at the ask, sell at the bid, else the working price. */
export function legFrom(c: ChainResponse, strike: number, type: "CE" | "PE", side: "BUY" | "SELL", q: ChainSide, lots: number): OptionLeg | null {
  const premium = (side === "BUY" ? q.ask : q.bid) ?? q.price;
  if (!premium) return null;
  const live = c.source.kind !== "estimate";
  const iv = q.greeks.iv;
  return {
    kind: "OPTION",
    type,
    side,
    strike,
    premium,
    premiumSource: live ? "market" : "calculated",
    iv: iv.value ?? c.atmIv ?? c.assumedIv,
    ivSource: iv.origin === "provided" ? "market" : iv.origin === "calculated" ? "calculated" : "assumed",
    lots,
    lotSize: c.lotSize ?? 1,
    expiryDays: Math.max(c.daysToExpiry, 0.01),
  };
}

export const expiryLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
export const fmt = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** A working price; an estimate that rounds to nothing shows as "< 0.05" rather than a misleading 0.00. */
export const priceText = (q: { price: number | null; ltp: number | null }) => (q.price === 0 ? "< 0.05" : fmt(q.price ?? q.ltp));
